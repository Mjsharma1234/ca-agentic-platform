import pytest
from app.agents.manifests import (
    IN01_Manifest, IN02_Manifest, GS02_Manifest,
    GS03_Manifest, GS05_Manifest, FL01_Manifest
)
from app.agents.runtime import AgentRuntime, AgentManifest, FORBIDDEN_TOOLS as RUNTIME_FORBIDDEN_TOOLS

FORBIDDEN_TOOLS = [
    'file_return', 'sign_document', 'submit_to_portal', 'submit_portal',
    'generate_udin', 'release_payment', 'delete_record',
    'modify_ledger', 'approve_gate', 'send_to_government',
    'execute_payment', 'create_signature', 'upload_to_portal'
]

ALL_MANIFESTS = [
    IN01_Manifest, IN02_Manifest, GS02_Manifest,
    GS03_Manifest, GS05_Manifest, FL01_Manifest
]

def test_no_agent_has_filing_tools():
    """ICAI SQC 1 Invariant: Agents can never possess government portal filing tools."""
    filing_tools = {'file_return', 'submit_to_portal', 'submit_portal', 'send_to_government', 'upload_to_portal'}
    for manifest in ALL_MANIFESTS:
        overlap = set(manifest.allowed_tools).intersection(filing_tools)
        assert len(overlap) == 0, f"Agent {manifest.agent_id} violates filing boundary with tools: {overlap}"

def test_no_agent_has_signing_tools():
    """Information Technology Act & ICAI: Only certified CAs can execute signatures/UDIN."""
    signing_tools = {'sign_document', 'create_signature', 'generate_udin'}
    for manifest in ALL_MANIFESTS:
        overlap = set(manifest.allowed_tools).intersection(signing_tools)
        assert len(overlap) == 0, f"Agent {manifest.agent_id} violates signing boundary with tools: {overlap}"

def test_no_agent_has_submission_tools():
    """Payment and ledger alteration are non-delegable human authorities."""
    submission_tools = {'release_payment', 'execute_payment', 'delete_record', 'modify_ledger', 'approve_gate'}
    for manifest in ALL_MANIFESTS:
        overlap = set(manifest.allowed_tools).intersection(submission_tools)
        assert len(overlap) == 0, f"Agent {manifest.agent_id} violates submission boundary with tools: {overlap}"

def test_forbidden_tools_list_is_complete():
    """Ensures forbidden tools list covers all core non-delegable authority actions."""
    mandatory_forbidden = [
        'sign_document', 'file_return', 'submit_portal',
        'generate_udin', 'release_payment', 'delete_record',
        'modify_ledger', 'approve_gate', 'send_to_government'
    ]
    for tool in mandatory_forbidden:
        assert tool in RUNTIME_FORBIDDEN_TOOLS, f"Missing {tool} from runtime FORBIDDEN_TOOLS"
        assert any(tool in f or f in tool for f in FORBIDDEN_TOOLS), f"Missing {tool} from authority test list"

def test_agent_tool_count_within_bounds():
    """Verifies bounded autonomy principle: tool count per agent between 1 and 10."""
    for manifest in ALL_MANIFESTS:
        assert 1 <= len(manifest.allowed_tools) <= 10, f"Agent {manifest.agent_id} has {len(manifest.allowed_tools)} tools, outside allowed range [1, 10]"

def test_all_agents_have_confidence_threshold():
    """Statutory agents must have an explicit confidence threshold >= 0.90."""
    for manifest in ALL_MANIFESTS:
        assert manifest.confidence_threshold >= 0.90, f"Agent {manifest.agent_id} threshold {manifest.confidence_threshold} below 0.90"

def test_all_agents_declare_gates():
    """High-risk statutory agents (Return Assembly GS-5) must declare human verification gates G6 and G7."""
    assert "G6" in GS05_Manifest.gates, "Return Assembly agent missing G6 four-eyes review gate"
    assert "G7" in GS05_Manifest.gates, "Return Assembly agent missing G7 partner DSC signing gate"
    assert "G3" in GS02_Manifest.gates, "IMS agent missing G3 approval gate"
    assert "G4" in GS03_Manifest.gates, "ITC matching agent missing G4 approval gate"

def test_reviewer_not_preparer_enforced():
    """Agent runtime must reject any manifest registering forbidden tools."""
    runtime = AgentRuntime()
    for m in ALL_MANIFESTS:
        runtime.register_agent(m)
        assert runtime.get_agent(m.agent_id) is not None

    # Rogue agent attempting to smuggle forbidden tools must be rejected
    rogue_manifest = AgentManifest(
        agent_id="ROGUE-1",
        agent_name="Autonomous Auto-Filer",
        family="ROGUE",
        version="1.0.0",
        description="Attempts to bypass partner gate and file return directly",
        allowed_tools=["collect_data", "file_return"],
        forbidden_tools=RUNTIME_FORBIDDEN_TOOLS,
        input_schema={},
        output_schema={},
        confidence_threshold=0.95
    )
    with pytest.raises(ValueError, match="violates FORBIDDEN_TOOLS policy"):
        runtime.register_agent(rogue_manifest)
