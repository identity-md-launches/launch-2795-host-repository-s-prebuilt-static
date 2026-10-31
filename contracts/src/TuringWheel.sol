// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISqueekCore} from "./ISqueekCore.sol";

/// @dev Work is settled core work, which lags live telemetry. The chain is the schedule, telemetry is the clock.
contract TuringWheel {
    struct Program {
        address author;
        uint64 startWork;
        uint64 endWork;
        uint32 squeeks;
        bytes source;
    }

    event ProgramQueued(uint256 indexed id, address indexed author, uint64 startWork, uint64 endWork, bytes source);
    event Squeeked(uint256 indexed id, address indexed fan, uint32 total);

    error SourceEmpty();
    error SourceTooLong();
    error SourceNotAscii();
    error AlreadyQueued(uint64 untilWork);
    error UnknownProgram();
    error AlreadySqueeked();

    uint64 public constant SLICE = 512;
    /// @dev Settled work trails live work by up to about 700 cycles. A slice starting at settled work
    /// would already be spent, so every slice starts at least this far ahead of it.
    uint64 public constant LEAD = 768;
    uint256 public constant MAX_SOURCE_BYTES = 140;

    ISqueekCore public immutable core;

    uint64 public queueEnd;

    Program[] private programs;
    mapping(address author => uint64 endWork) private lastEndWork;
    mapping(uint256 id => mapping(address fan => bool)) public hasSqueeked;

    constructor(address core_) {
        core = ISqueekCore(core_);
    }

    function programCount() external view returns (uint256) {
        return programs.length;
    }

    function program(uint256 id) external view returns (Program memory) {
        if (id >= programs.length) revert UnknownProgram();
        return programs[id];
    }

    function page(uint256 startId, uint256 limit) external view returns (Program[] memory result) {
        uint256 count = programs.length;
        if (startId >= count) return result;

        uint256 remaining = count - startId;
        uint256 size = limit < remaining ? limit : remaining;
        result = new Program[](size);
        for (uint256 i; i < size; ++i) {
            result[i] = programs[startId + i];
        }
    }

    function currentWork() public view returns (uint64) {
        return core.state().cumulativeWork;
    }

    function submit(bytes calldata source) external returns (uint256 id) {
        _validate(source);

        uint64 work = currentWork();
        uint64 untilWork = lastEndWork[msg.sender];
        if (untilWork > work) revert AlreadyQueued(untilWork);

        uint64 earliest = work + LEAD;
        uint64 startWork = queueEnd > earliest ? queueEnd : earliest;
        uint64 endWork = startWork + SLICE;

        queueEnd = endWork;
        lastEndWork[msg.sender] = endWork;
        id = programs.length;
        programs.push(Program(msg.sender, startWork, endWork, 0, source));

        emit ProgramQueued(id, msg.sender, startWork, endWork, source);
    }

    function squeek(uint256 id) external {
        if (id >= programs.length) revert UnknownProgram();
        if (hasSqueeked[id][msg.sender]) revert AlreadySqueeked();

        hasSqueeked[id][msg.sender] = true;
        emit Squeeked(id, msg.sender, ++programs[id].squeeks);
    }

    function _validate(bytes calldata source) private pure {
        uint256 length = source.length;
        if (length == 0) revert SourceEmpty();
        if (length > MAX_SOURCE_BYTES) revert SourceTooLong();

        for (uint256 i; i < length; ++i) {
            bytes1 char = source[i];
            if (char < 0x20 || char > 0x7e) revert SourceNotAscii();
        }
    }
}
