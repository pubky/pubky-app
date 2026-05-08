import type {
  TAwaitLnVerificationResult,
  TCreateLnVerificationResult,
  TLnInfoResult,
  TSendSmsCodeResult,
  TSmsInfoResult,
  TVerifySmsCodeParams,
  TVerifySmsCodeResult,
} from '@/services/homegate/homegate.types';

export type THomegateCreateLnVerificationResult = TCreateLnVerificationResult;
export type THomegateAwaitLnVerificationResult = TAwaitLnVerificationResult;
export type THomegateVerifySmsCodeParams = TVerifySmsCodeParams;
export type THomegateVerifySmsCodeResult = TVerifySmsCodeResult;
export type THomegateSendSmsCodeResult = TSendSmsCodeResult;
export type THomegateSmsInfoResult = TSmsInfoResult;
export type THomegateLnInfoResult = TLnInfoResult;
