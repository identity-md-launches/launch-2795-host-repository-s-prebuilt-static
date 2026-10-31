// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ISqueekCore} from "../src/ISqueekCore.sol";
import {TuringWheel} from "../src/TuringWheel.sol";

/// Reads the real core on a local fork. Nothing is broadcast.
/// Set SQUEEKCHAIN_API_WORK to also pin cumulativeWork to the API, see README.
contract TuringWheelForkTest is Test {
    uint256 internal constant SEPOLIA = 11155111;
    ISqueekCore internal constant CORE = ISqueekCore(0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44);

    modifier onlyOnFork() {
        vm.skip(block.chainid != SEPOLIA);
        _;
    }

    function test_StateDecodesAgainstTheRealCore() public onlyOnFork {
        ISqueekCore.CoreState memory state = CORE.state();

        assertGt(state.settledThroughRound, 0);
        assertGt(state.cumulativeWork, 0);
        assertGt(state.cumulativeBlockUnits, 0);
        assertGt(state.blockHeight, 0);
        assertGt(state.workPerThousandBlocks, 0);
        assertGt(state.authorizationNonce, 0);
    }

    function test_StateIsExactlyEightWordsInTheAgreedOrder() public onlyOnFork {
        (bool ok, bytes memory raw) = address(CORE).staticcall(abi.encodeCall(ISqueekCore.state, ()));
        assertTrue(ok);
        assertEq(raw.length, 8 * 32);

        (
            uint256 settledThroughRound,
            uint256 cumulativeWork,
            uint256 cumulativeBlockUnits,
            uint256 blockHeight,
            uint256 blockProgress,
            uint256 workPerThousandBlocks,
            uint256 authorizationNonce,
            uint256 paused
        ) = abi.decode(raw, (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256));

        ISqueekCore.CoreState memory state = CORE.state();
        assertEq(state.settledThroughRound, settledThroughRound);
        assertEq(state.cumulativeWork, cumulativeWork);
        assertEq(state.cumulativeBlockUnits, cumulativeBlockUnits);
        assertEq(state.blockHeight, blockHeight);
        assertEq(state.blockProgress, blockProgress);
        assertEq(state.workPerThousandBlocks, workPerThousandBlocks);
        assertEq(state.authorizationNonce, authorizationNonce);
        assertEq(state.paused ? 1 : 0, paused);
    }

    function test_CumulativeWorkMatchesTheApi() public onlyOnFork {
        uint256 expected = vm.envOr("SQUEEKCHAIN_API_WORK", uint256(0));
        vm.skip(expected == 0);
        assertEq(CORE.state().cumulativeWork, expected);
    }

    function test_WheelSchedulesFromRealWork() public onlyOnFork {
        TuringWheel wheel = new TuringWheel(address(CORE));
        uint64 work = CORE.state().cumulativeWork;
        assertEq(wheel.currentWork(), work);

        uint256 first = wheel.submit("sin(t/9+r)");
        assertEq(wheel.program(first).startWork, work + wheel.LEAD());
        assertEq(wheel.program(first).endWork, work + wheel.LEAD() + wheel.SLICE());

        vm.prank(makeAddr("second"));
        uint256 second = wheel.submit("t");
        assertEq(wheel.program(second).startWork, work + wheel.LEAD() + wheel.SLICE());
    }
}
