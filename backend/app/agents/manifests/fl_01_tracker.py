from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

FL01_Manifest = AgentManifest(
    agent_id="FL-1",
    agent_name="Filing Tracker Agent",
    family="Filing",
    version="1.0.0",
    description="Monitors filing acknowledgement",
    allowed_tools=['check_portal_status', 'validate_arn', 'send_filing_confirmation', 'alert_partner_on_failure'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=[]
)
