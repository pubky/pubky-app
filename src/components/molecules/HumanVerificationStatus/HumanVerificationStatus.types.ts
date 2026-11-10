export interface HumanVerificationStatusProps {
  layout: 'mobile' | 'desktop';
  reason: 'geoblocked' | 'error';
  method: 'payment' | 'phone';
  testId?: string;
}
