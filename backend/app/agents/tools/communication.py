from dataclasses import dataclass

@dataclass
class MessageResult:
    status: str
    message_id: str

@dataclass
class EmailResult:
    status: str
    message_id: str

@dataclass
class SMSResult:
    status: str
    message_id: str

def send_waba_message(phone: str, template: str, params: dict) -> MessageResult:
    return MessageResult(status="Sent", message_id="waba-123")

def send_email(to: str, subject: str, body: str) -> EmailResult:
    return EmailResult(status="Sent", message_id="email-123")

def send_sms(phone: str, message: str) -> SMSResult:
    return SMSResult(status="Sent", message_id="sms-123")
