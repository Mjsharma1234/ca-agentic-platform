import pytest
from app.human_gates.fsm import ObligationFSM, ObligationState

def test_valid_transitions():
    fsm = ObligationFSM()
    fsm.states["obl_123"] = ObligationState.NOT_STARTED
    success = fsm.transition("obl_123", ObligationState.NOT_STARTED, ObligationState.DATA_COLLECTED, "actor_1")
    assert success is True
    assert fsm.get_state("obl_123") == ObligationState.DATA_COLLECTED

def test_invalid_transition_rejected():
    fsm = ObligationFSM()
    fsm.states["obl_123"] = ObligationState.NOT_STARTED
    success = fsm.transition("obl_123", ObligationState.NOT_STARTED, ObligationState.REVIEWED, "actor_1")
    assert success is False
    assert fsm.get_state("obl_123") == ObligationState.NOT_STARTED

def test_failed_state_from_any():
    fsm = ObligationFSM()
    fsm.states["obl_123"] = ObligationState.SIGNING_PENDING
    success = fsm.transition("obl_123", ObligationState.SIGNING_PENDING, ObligationState.FAILED, "actor_1")
    assert success is True
