from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

IN02_Manifest = AgentManifest(
    agent_id="IN-2",
    agent_name="Document Chase Agent",
    family="Intake",
    version="1.0.0",
    description="Chases clients for documents",
    allowed_tools=['send_waba_message', 'send_email_reminder', 'check_document_status', 'escalate_to_partner'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=['G1']
)
