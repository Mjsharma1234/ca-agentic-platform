from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

GS05_Manifest = AgentManifest(
    agent_id="GS-5",
    agent_name="Return Assembly Agent",
    family="GST",
    version="1.0.0",
    description="Assembles GSTR-3B",
    allowed_tools=['collect_period_data', 'run_rule_checks', 'compute_tax_liability', 'build_payload', 'generate_variance_memo', 'create_evidence_pack'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=['G6', 'G7']
)
