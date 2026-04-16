use tee_shared::PolicyId;

pub enum PolicyError {
    Unauthorized,
    NotAFoundation,
    PolicyNotFound(PolicyId),
    InvalidSaleConfig(&'static str),
    InvalidIpfsCid,
    NaturalLanguageTooShort,
    NaturalLanguageTooLong,
    EscrowNotSet,
    WrongStatusForClose,
    WrongStatusForEdit,
}

impl PolicyError {
    pub fn panic(&self) -> ! {
        let msg = match self {
            PolicyError::Unauthorized => "Unauthorized".to_string(),
            PolicyError::NotAFoundation => "NotAFoundation".to_string(),
            PolicyError::PolicyNotFound(id) => format!("PolicyNotFound({})", id),
            PolicyError::InvalidSaleConfig(reason) => format!("InvalidSaleConfig: {}", reason),
            PolicyError::InvalidIpfsCid => "InvalidIpfsCid".to_string(),
            PolicyError::NaturalLanguageTooShort => "NaturalLanguageTooShort".to_string(),
            PolicyError::NaturalLanguageTooLong => "NaturalLanguageTooLong".to_string(),
            PolicyError::EscrowNotSet => "EscrowNotSet".to_string(),
            PolicyError::WrongStatusForClose => "WrongStatusForClose".to_string(),
            PolicyError::WrongStatusForEdit => "WrongStatusForEdit".to_string(),
        };
        near_sdk::env::panic_str(&msg)
    }
}
