export type PubchiDeviceKeyRecord = {
  id: string;
  owner: string;
  signer: string;
  key: CryptoKey;
  created_at: number;
  expires_at: number;
};

export const pubchiDeviceKeyTableSchema = '&id, owner, signer, expires_at';
