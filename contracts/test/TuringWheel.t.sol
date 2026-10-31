// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test, stdError} from "forge-std/Test.sol";

import {ISqueekCore} from "../src/ISqueekCore.sol";
import {TuringWheel} from "../src/TuringWheel.sol";

/// Every field but cumulativeWork holds a decoy, so reading the wrong tuple slot fails the tests.
contract MockSqueekCore is ISqueekCore {
    uint64 public work;

    function setWork(uint64 work_) external {
        work = work_;
    }

    function state() external view returns (CoreState memory) {
        return CoreState({
            settledThroughRound: type(uint64).max - 1,
            cumulativeWork: work,
            cumulativeBlockUnits: type(uint96).max - 2,
            blockHeight: type(uint64).max - 3,
            blockProgress: type(uint96).max - 4,
            workPerThousandBlocks: type(uint32).max - 5,
            authorizationNonce: type(uint256).max - 6,
            paused: true
        });
    }
}

abstract contract WheelFixture is Test {
    uint64 internal constant SLICE = 512;
    uint64 internal constant LEAD = 768;
    uint64 internal constant WORK = 58518;
    uint64 internal constant FIRST_START = WORK + LEAD;
    uint64 internal constant FIRST_END = FIRST_START + SLICE;
    uint64 internal constant PEAK_OBSERVED_LAG = 700;
    bytes internal constant SRC = "sin(t/9+r)";

    // Keep in step with `forge inspect TuringWheel storage-layout`.
    uint256 internal constant PROGRAMS_SLOT = 1;
    uint256 internal constant PROGRAM_SIZE_SLOTS = 3;

    MockSqueekCore internal mock;
    TuringWheel internal wheel;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public virtual {
        mock = new MockSqueekCore();
        mock.setWork(WORK);
        wheel = new TuringWheel(address(mock));
    }

    function _submitAs(address author) internal returns (uint256) {
        vm.prank(author);
        return wheel.submit(SRC);
    }

    function _author(uint256 index) internal pure returns (address) {
        return address(uint160(0x1000 + index));
    }

    function _ascii(uint256 length) internal pure returns (bytes memory source) {
        source = new bytes(length);
        for (uint256 i; i < length; ++i) {
            source[i] = "a";
        }
    }

    function _setSqueeks(uint256 id, uint32 squeeks) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(PROGRAMS_SLOT))) + id * PROGRAM_SIZE_SLOTS + 1);
        uint256 endWork = uint256(vm.load(address(wheel), slot)) & type(uint64).max;
        vm.store(address(wheel), slot, bytes32(endWork | (uint256(squeeks) << 64)));
    }
}

contract TuringWheelSetupTest is WheelFixture {
    function test_Constants() public view {
        assertEq(wheel.SLICE(), 512);
        assertEq(wheel.LEAD(), 768);
        assertEq(wheel.MAX_SOURCE_BYTES(), 140);
        assertEq(address(wheel.core()), address(mock));
    }

    function test_StartsEmpty() public view {
        assertEq(wheel.programCount(), 0);
        assertEq(wheel.queueEnd(), 0);
    }

    function test_CurrentWorkReadsCumulativeWorkFromCore() public {
        assertEq(wheel.currentWork(), WORK);
        mock.setWork(WORK + 7);
        assertEq(wheel.currentWork(), WORK + 7);
    }

    function test_RejectsEther() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent,) = address(wheel).call{value: 1 wei}("");
        assertFalse(sent);

        vm.prank(alice);
        (bool paid,) = address(wheel).call{value: 1 wei}(abi.encodeCall(TuringWheel.submit, (SRC)));
        assertFalse(paid);
        assertEq(address(wheel).balance, 0);
    }
}

contract TuringWheelScheduleTest is WheelFixture {
    function test_FirstSubmitStartsOneLeadPastCurrentWork() public {
        vm.expectEmit(true, true, false, true, address(wheel));
        emit TuringWheel.ProgramQueued(0, alice, FIRST_START, FIRST_END, SRC);

        uint256 id = _submitAs(alice);

        assertEq(id, 0);
        assertEq(wheel.programCount(), 1);
        assertEq(wheel.queueEnd(), FIRST_END);

        TuringWheel.Program memory program = wheel.program(id);
        assertEq(program.author, alice);
        assertEq(program.startWork, FIRST_START);
        assertEq(program.endWork, FIRST_END);
        assertEq(program.squeeks, 0);
        assertEq(program.source, SRC);
    }

    function test_FirstSubmitAtWorkZero() public {
        mock.setWork(0);
        uint256 id = _submitAs(alice);
        assertEq(wheel.program(id).startWork, LEAD);
        assertEq(wheel.program(id).endWork, LEAD + SLICE);
    }

    function test_IdsAreSequentialFromZero() public {
        assertEq(_submitAs(alice), 0);
        assertEq(_submitAs(bob), 1);
        assertEq(_submitAs(carol), 2);
        assertEq(wheel.programCount(), 3);
    }

    function test_EventCarriesTheScheduledSliceOnABackedUpQueue() public {
        _submitAs(alice);

        vm.expectEmit(true, true, false, true, address(wheel));
        emit TuringWheel.ProgramQueued(1, bob, FIRST_END, FIRST_END + SLICE, SRC);
        _submitAs(bob);
    }

    function test_EmptyQueueJumpsForwardPastCurrentWork() public {
        _submitAs(alice);

        uint64 later = FIRST_END + 9000;
        mock.setWork(later);
        uint256 id = _submitAs(bob);

        assertEq(wheel.program(id).startWork, later + LEAD);
        assertEq(wheel.program(id).endWork, later + LEAD + SLICE);
        assertEq(wheel.queueEnd(), later + LEAD + SLICE);
    }

    function test_TailExactlyOneLeadAheadContinuesWithoutAGap() public {
        _submitAs(alice);

        mock.setWork(FIRST_END - LEAD);
        uint256 id = _submitAs(bob);

        assertEq(wheel.program(id).startWork, FIRST_END);
    }

    function test_TailInsideTheLeadLeavesAGapForHouseRom() public {
        _submitAs(alice);

        mock.setWork(FIRST_END - LEAD + 1);
        uint256 id = _submitAs(bob);

        assertEq(wheel.program(id).startWork, FIRST_END + 1);
    }

    function test_SubmitDuringARunningSliceStillGetsTheFullLead() public {
        _submitAs(alice);

        uint64 midSlice = FIRST_START + 100;
        mock.setWork(midSlice);
        uint256 id = _submitAs(bob);

        assertEq(wheel.program(id).startWork, midSlice + LEAD);
    }

    function test_SliceStartsPastThePeakObservedLag() public {
        uint256 id = _submitAs(alice);
        assertGt(wheel.program(id).startWork, WORK + PEAK_OBSERVED_LAG);
    }

    function test_BackedUpQueueStacksOnQueueEnd() public {
        for (uint256 i; i < 20; ++i) {
            uint256 id = _submitAs(_author(i));
            assertEq(wheel.program(id).startWork, FIRST_START + uint64(i) * SLICE);
            assertEq(wheel.program(id).endWork, FIRST_START + (uint64(i) + 1) * SLICE);
        }
        assertEq(wheel.queueEnd(), FIRST_START + 20 * SLICE);
    }

    function test_WorkAdvancingBehindQueueEndDoesNotMoveTheSchedule() public {
        for (uint256 i; i < 10; ++i) {
            _submitAs(_author(i));
        }
        uint64 tail = wheel.queueEnd();

        mock.setWork(WORK + 3 * SLICE + 1);
        uint256 id = _submitAs(alice);

        assertEq(wheel.program(id).startWork, tail);
    }

    function test_SubmitsStackWhileHamsterSleeps() public {
        vm.warp(1_000_000);
        for (uint256 i; i < 5; ++i) {
            vm.warp(block.timestamp + 3 hours);
            vm.roll(block.number + 900);
            uint256 id = _submitAs(_author(i));
            assertEq(wheel.program(id).startWork, FIRST_START + uint64(i) * SLICE);
        }
        assertEq(wheel.currentWork(), WORK);
    }

    function test_CoreWorkFallingNeverRewindsTheQueue() public {
        _submitAs(alice);
        uint64 tail = wheel.queueEnd();

        mock.setWork(1);
        uint256 id = _submitAs(bob);

        assertEq(wheel.program(id).startWork, tail);
        assertEq(wheel.queueEnd(), tail + SLICE);
    }

    function testFuzz_SlicesNeverOverlapAndAreStrictlyOrdered(uint256 seed, uint256 steps) public {
        steps = bound(steps, 1, 64);
        uint64 work = WORK;
        uint64[] memory workAtSubmit = new uint64[](steps);
        uint256 queued;

        for (uint256 i; i < steps; ++i) {
            uint256 entropy = uint256(keccak256(abi.encode(seed, i)));
            // One step in three leaves work alone, which is the hamster asleep.
            if (entropy % 3 != 0) work += uint64((entropy >> 8) % 2048);
            mock.setWork(work);

            uint64 tailBefore = wheel.queueEnd();
            uint64 earliest = work + LEAD;
            vm.prank(_author((entropy >> 32) % 6));
            try wheel.submit(SRC) returns (uint256 id) {
                assertEq(id, queued);
                workAtSubmit[queued++] = work;
                assertEq(wheel.program(id).startWork, tailBefore > earliest ? tailBefore : earliest);
                assertEq(wheel.queueEnd(), wheel.program(id).endWork);
                assertGt(wheel.queueEnd(), tailBefore);
            } catch (bytes memory reason) {
                assertEq(bytes4(reason), TuringWheel.AlreadyQueued.selector);
                assertEq(wheel.queueEnd(), tailBefore);
            }
        }

        assertGt(queued, 0);
        assertEq(wheel.programCount(), queued);

        TuringWheel.Program[] memory programs = wheel.page(0, queued);
        for (uint256 i; i < queued; ++i) {
            assertEq(programs[i].endWork, programs[i].startWork + SLICE);
            assertGe(programs[i].startWork, workAtSubmit[i] + LEAD);
            if (i > 0) {
                assertGe(programs[i].startWork, programs[i - 1].endWork);
                assertGt(programs[i].startWork, programs[i - 1].startWork);
            }
        }
    }
}

contract TuringWheelCooldownTest is WheelFixture {
    function _expectLocked(address author, uint64 untilWork) internal {
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(TuringWheel.AlreadyQueued.selector, untilWork));
        wheel.submit(SRC);
    }

    function test_LockedWhileWaitingForTheSlice() public {
        _submitAs(alice);
        _submitAs(bob);
        _expectLocked(bob, FIRST_END + SLICE);
    }

    function test_LockedWhileTheSliceRuns() public {
        _submitAs(alice);
        mock.setWork(FIRST_START + 100);
        _expectLocked(alice, FIRST_END);
    }

    function test_LockedOneCycleBeforeTheSliceEnds() public {
        _submitAs(alice);
        mock.setWork(FIRST_END - 1);
        _expectLocked(alice, FIRST_END);
    }

    function test_UnlocksExactlyAtEndWork() public {
        _submitAs(alice);
        mock.setWork(FIRST_END);
        assertEq(_submitAs(alice), 1);
    }

    function test_UnlocksAfterTheSliceEnded() public {
        _submitAs(alice);
        uint64 later = FIRST_END + 10 * SLICE;
        mock.setWork(later);
        assertEq(_submitAs(alice), 1);
        assertEq(wheel.program(1).startWork, later + LEAD);
    }

    function test_FollowsTheAuthorsLatestProgram() public {
        _submitAs(alice);
        mock.setWork(FIRST_END);
        _submitAs(alice);
        _expectLocked(alice, FIRST_END + LEAD + SLICE);
    }

    function test_DoesNotLockOtherAuthors() public {
        _submitAs(alice);
        assertEq(_submitAs(bob), 1);
    }

    function test_StaysLockedAcrossASleepUntilWorkMoves() public {
        _submitAs(alice);

        vm.warp(block.timestamp + 12 hours);
        vm.roll(block.number + 3600);
        _expectLocked(alice, FIRST_END);

        mock.setWork(FIRST_END);
        assertEq(_submitAs(alice), 1);
    }

    function test_UnlocksDuringASleepIfTheSliceEndedBeforeHeSleeps() public {
        _submitAs(alice);
        mock.setWork(FIRST_END + 40);

        vm.warp(block.timestamp + 12 hours);

        assertEq(_submitAs(alice), 1);
        assertEq(wheel.program(1).startWork, FIRST_END + 40 + LEAD);
    }

    function test_SourceErrorsTakePriorityOverTheLock() public {
        _submitAs(alice);
        vm.prank(alice);
        vm.expectRevert(TuringWheel.SourceEmpty.selector);
        wheel.submit("");
    }
}

contract TuringWheelValidationTest is WheelFixture {
    function test_RejectsEmptySource() public {
        vm.expectRevert(TuringWheel.SourceEmpty.selector);
        wheel.submit("");
    }

    function test_AcceptsOneByte() public {
        assertEq(wheel.program(wheel.submit("t")).source, bytes("t"));
    }

    function test_Accepts140Bytes() public {
        bytes memory source = _ascii(140);
        assertEq(wheel.program(wheel.submit(source)).source, source);
    }

    function test_Rejects141Bytes() public {
        bytes memory source = _ascii(141);
        vm.expectRevert(TuringWheel.SourceTooLong.selector);
        wheel.submit(source);
    }

    function test_TooLongWinsOverNotAscii() public {
        bytes memory source = _ascii(141);
        source[0] = 0xff;
        vm.expectRevert(TuringWheel.SourceTooLong.selector);
        wheel.submit(source);
    }

    function test_AcceptsPrintableBounds() public {
        bytes memory source = hex"207e";
        assertEq(wheel.program(wheel.submit(source)).source, source);
    }

    function test_Rejects0x7f() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(hex"7f");
    }

    function test_Rejects0x00() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(hex"00");
    }

    function test_Rejects0x1f() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(hex"1f");
    }

    function test_Rejects0x80() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(hex"80");
    }

    function test_RejectsNewline() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit("t\n");
    }

    function test_RejectsUtf8Multibyte() public {
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(hex"74e28093");
    }

    function test_RejectsBadByteInTheLastPosition() public {
        bytes memory source = _ascii(140);
        source[139] = 0x7f;
        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(source);
    }

    function testFuzz_RejectsAnyNonPrintableByteAnywhere(uint8 bad, uint256 length, uint256 position) public {
        vm.assume(bad < 0x20 || bad > 0x7e);
        length = bound(length, 1, 140);
        position = bound(position, 0, length - 1);

        bytes memory source = _ascii(length);
        source[position] = bytes1(bad);

        vm.expectRevert(TuringWheel.SourceNotAscii.selector);
        wheel.submit(source);
    }

    function testFuzz_PrintableSourceRoundTrips(uint256 seed, uint256 length) public {
        length = bound(length, 1, 140);
        bytes memory source = new bytes(length);
        for (uint256 i; i < length; ++i) {
            source[i] = bytes1(uint8(0x20 + uint256(keccak256(abi.encode(seed, i))) % 95));
        }

        assertEq(wheel.program(wheel.submit(source)).source, source);
    }
}

contract TuringWheelReadTest is WheelFixture {
    function _fill(uint256 count) internal {
        for (uint256 i; i < count; ++i) {
            _submitAs(_author(i));
        }
    }

    function test_ProgramRevertsOnUnknownIdWhenEmpty() public {
        vm.expectRevert(TuringWheel.UnknownProgram.selector);
        wheel.program(0);
    }

    function test_ProgramRevertsOneIdPastTheEnd() public {
        _fill(2);
        wheel.program(1);
        vm.expectRevert(TuringWheel.UnknownProgram.selector);
        wheel.program(2);
    }

    function test_ProgramRevertsOnHugeId() public {
        _fill(1);
        vm.expectRevert(TuringWheel.UnknownProgram.selector);
        wheel.program(type(uint256).max);
    }

    function test_PageOnEmptyQueue() public view {
        assertEq(wheel.page(0, 10).length, 0);
    }

    function test_PageReturnsOldestFirst() public {
        _fill(3);
        TuringWheel.Program[] memory programs = wheel.page(0, 10);
        assertEq(programs.length, 3);
        assertEq(programs[0].author, _author(0));
        assertEq(programs[1].author, _author(1));
        assertEq(programs[2].author, _author(2));
        assertEq(programs[2].source, SRC);
        assertEq(programs[2].startWork, FIRST_START + 2 * SLICE);
    }

    function test_PageWindowInTheMiddle() public {
        _fill(5);
        TuringWheel.Program[] memory programs = wheel.page(1, 2);
        assertEq(programs.length, 2);
        assertEq(programs[0].author, _author(1));
        assertEq(programs[1].author, _author(2));
    }

    function test_PageClampsAtTheEnd() public {
        _fill(3);
        TuringWheel.Program[] memory programs = wheel.page(2, 10);
        assertEq(programs.length, 1);
        assertEq(programs[0].author, _author(2));
    }

    function test_PageStartingExactlyAtTheEndIsEmpty() public {
        _fill(3);
        assertEq(wheel.page(3, 10).length, 0);
    }

    function test_PagePastTheEndIsEmpty() public {
        _fill(3);
        assertEq(wheel.page(99, 10).length, 0);
    }

    function test_PageWithLimitZeroIsEmpty() public {
        _fill(3);
        assertEq(wheel.page(0, 0).length, 0);
        assertEq(wheel.page(1, 0).length, 0);
    }

    function test_PageSurvivesMaxLimit() public {
        _fill(3);
        assertEq(wheel.page(1, type(uint256).max).length, 2);
    }

    function test_PageSurvivesMaxStart() public {
        _fill(3);
        assertEq(wheel.page(type(uint256).max, type(uint256).max).length, 0);
    }

    function test_PageCarriesSqueeks() public {
        _fill(2);
        vm.prank(alice);
        wheel.squeek(1);
        assertEq(wheel.page(1, 1)[0].squeeks, 1);
    }
}

contract TuringWheelSqueekTest is WheelFixture {
    function test_SqueekCountsAndEmits() public {
        uint256 id = _submitAs(alice);

        vm.expectEmit(true, true, false, true, address(wheel));
        emit TuringWheel.Squeeked(id, bob, 1);
        vm.prank(bob);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, 1);
        assertTrue(wheel.hasSqueeked(id, bob));
        assertFalse(wheel.hasSqueeked(id, carol));
    }

    function test_SqueeksFromManyWalletsAddUp() public {
        uint256 id = _submitAs(alice);

        vm.prank(bob);
        wheel.squeek(id);

        vm.expectEmit(true, true, false, true, address(wheel));
        emit TuringWheel.Squeeked(id, carol, 2);
        vm.prank(carol);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, 2);
    }

    function test_DoubleSqueekReverts() public {
        uint256 id = _submitAs(alice);
        vm.prank(bob);
        wheel.squeek(id);

        vm.prank(bob);
        vm.expectRevert(TuringWheel.AlreadySqueeked.selector);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, 1);
    }

    function test_OneSqueekPerProgramNotPerWallet() public {
        uint256 first = _submitAs(alice);
        uint256 second = _submitAs(bob);

        vm.startPrank(carol);
        wheel.squeek(first);
        wheel.squeek(second);
        vm.stopPrank();

        assertEq(wheel.program(first).squeeks, 1);
        assertEq(wheel.program(second).squeeks, 1);
    }

    function test_SqueekOnUnknownIdReverts() public {
        vm.expectRevert(TuringWheel.UnknownProgram.selector);
        wheel.squeek(0);

        _submitAs(alice);
        vm.expectRevert(TuringWheel.UnknownProgram.selector);
        wheel.squeek(1);
    }

    function test_SqueekOnAFinishedProgram() public {
        uint256 id = _submitAs(alice);
        mock.setWork(WORK + 100 * SLICE);

        vm.prank(bob);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, 1);
    }

    function test_AuthorMaySqueekTheirOwnProgram() public {
        uint256 id = _submitAs(alice);
        vm.prank(alice);
        wheel.squeek(id);
        assertEq(wheel.program(id).squeeks, 1);
    }

    function test_SqueekLeavesTheScheduleAlone() public {
        uint256 id = _submitAs(alice);
        vm.prank(bob);
        wheel.squeek(id);

        TuringWheel.Program memory program = wheel.program(id);
        assertEq(program.author, alice);
        assertEq(program.startWork, FIRST_START);
        assertEq(program.endWork, FIRST_END);
    }

    function test_HasSqueekedOnUnknownIdIsFalse() public view {
        assertFalse(wheel.hasSqueeked(42, alice));
    }

    function test_SqueekCountReachesUint32Max() public {
        uint256 id = _submitAs(alice);
        _setSqueeks(id, type(uint32).max - 1);

        vm.expectEmit(true, true, false, true, address(wheel));
        emit TuringWheel.Squeeked(id, bob, type(uint32).max);
        vm.prank(bob);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, type(uint32).max);
        assertEq(wheel.program(id).endWork, FIRST_END);
    }

    function test_SqueekCountCannotWrapPastUint32Max() public {
        uint256 id = _submitAs(alice);
        _setSqueeks(id, type(uint32).max);

        vm.prank(bob);
        vm.expectRevert(stdError.arithmeticError);
        wheel.squeek(id);

        assertEq(wheel.program(id).squeeks, type(uint32).max);
        assertFalse(wheel.hasSqueeked(id, bob));
    }
}

contract WheelHandler is CommonBase, StdUtils {
    TuringWheel public immutable wheel;
    MockSqueekCore public immutable mock;

    uint64 public highestQueueEnd;
    uint256 public submits;
    bool public queueEndShrank;
    bool public leadBroken;

    constructor(TuringWheel wheel_, MockSqueekCore mock_) {
        wheel = wheel_;
        mock = mock_;
    }

    function submit(uint256 authorSeed) external {
        uint64 earliest = mock.work() + wheel.LEAD();
        vm.prank(address(uint160(0x1000 + authorSeed % 8)));
        try wheel.submit("t") returns (uint256 id) {
            ++submits;
            if (wheel.program(id).startWork < earliest) leadBroken = true;
        } catch (bytes memory reason) {
            if (bytes4(reason) != TuringWheel.AlreadyQueued.selector) revert("unexpected revert");
        }
        _observe();
    }

    function run(uint256 cycles) external {
        mock.setWork(mock.work() + uint64(bound(cycles, 1, 700)));
        _observe();
    }

    function _observe() private {
        uint64 tail = wheel.queueEnd();
        if (tail < highestQueueEnd) queueEndShrank = true;
        highestQueueEnd = tail;
    }
}

contract TuringWheelInvariantTest is StdInvariant, Test {
    TuringWheel internal wheel;
    WheelHandler internal handler;

    function setUp() public {
        MockSqueekCore mock = new MockSqueekCore();
        mock.setWork(58518);
        wheel = new TuringWheel(address(mock));
        handler = new WheelHandler(wheel, mock);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = WheelHandler.submit.selector;
        selectors[1] = WheelHandler.run.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_QueueEndOnlyGrows() public view {
        assertFalse(handler.queueEndShrank());
        assertEq(wheel.queueEnd(), handler.highestQueueEnd());
    }

    function invariant_SlicesAreStrictlyOrdered() public view {
        TuringWheel.Program[] memory programs = wheel.page(0, wheel.programCount());
        for (uint256 i; i < programs.length; ++i) {
            assertEq(programs[i].endWork, programs[i].startWork + wheel.SLICE());
            if (i > 0) assertGe(programs[i].startWork, programs[i - 1].endWork);
        }
    }

    function invariant_NoSliceStartsInsideTheLead() public view {
        assertFalse(handler.leadBroken());
    }

    function invariant_QueueEndIsTheLastSliceEnd() public view {
        uint256 count = wheel.programCount();
        if (count > 0) assertEq(wheel.queueEnd(), wheel.program(count - 1).endWork);
    }

    function afterInvariant() public view {
        assertGt(handler.submits(), 0);
        assertEq(wheel.programCount(), handler.submits());
    }
}
