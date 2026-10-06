from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

IN01_Manifest = AgentManifest(
    agent_id="IN-1",
    agent_name="Document Intake & Extraction Agent",
    family="Intake",
    version="1.0.0",
    description="Extracts data from documents via VLM",
    allowed_tools=['extract_fields', 'classify_document', 'compute_checksum', 'store_document', 'create_extraction_record'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=['G2']
)
