from dataclasses import dataclass
from typing import List, Optional

FORBIDDEN_TOOLS = [
    'file_return', 'sign_document', 'submit_portal', 'generate_udin',
    'release_payment', 'delete_record', 'modify_ledger', 'approve_gate',
    'send_to_government'
]

@dataclass
class AgentManifest:
    agent_id: str
    agent_name: str
    family: str
    version: str
    description: str
    allowed_tools: List[str]
    forbidden_tools: List[str]
    input_schema: dict
    output_schema: dict
    confidence_threshold: float = 0.95
    max_retries: int = 3
    tier: int = 1
    gates: List[str] = None

@dataclass
class AgentOutput:
    agent_id: str
    output_data: dict
    confidence_score: float
    requires_gate: bool
    gate_id: Optional[str]
    evidence_pack: dict
    audit_entry: dict
    execution_time_ms: int

class AgentRuntime:
    def __init__(self):
        self._agents = {}

    def register_agent(self, manifest: AgentManifest):
        self.validate_manifest(manifest)
        self._agents[manifest.agent_id] = manifest

    def validate_manifest(self, manifest: AgentManifest):
        for tool in FORBIDDEN_TOOLS:
            if tool in manifest.allowed_tools or tool not in manifest.forbidden_tools:
                raise ValueError(f"Manifest for {manifest.agent_id} violates FORBIDDEN_TOOLS policy on tool: {tool}")

    def execute(self, agent_id: str, input_data: dict, context: dict) -> AgentOutput:
        manifest = self.get_agent(agent_id)
        # Mock execution logic
        return AgentOutput(
            agent_id=agent_id,
            output_data={"status": "completed"},
            confidence_score=0.98,
            requires_gate=False,
            gate_id=None,
            evidence_pack={},
            audit_entry={"action": "executed"},
            execution_time_ms=120
        )

    def get_agent(self, agent_id: str) -> AgentManifest:
        return self._agents[agent_id]

    def list_agents(self) -> List[AgentManifest]:
        return list(self._agents.values())
