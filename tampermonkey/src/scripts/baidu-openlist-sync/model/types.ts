export type SyncConfig = {
  openlist: string;
  openlistUser: string;
  openlistPass: string;
  openlistBaiduMountPath: string;
  aria2RpcUrl: string;
  aria2Secret: string;
  downloadDir: string;
};

export type OpenlistFileItem = {
  name: string;
  is_dir: boolean;
  sign: string;
};

export type OpenlistLoginResponse = {
  code: number;
  data?: {
    token: string;
  };
};

export type OpenlistListResponse = {
  code: number;
  data?: {
    content?: OpenlistFileItem[];
  };
};

export type SyncCounter = {
  total: number;
  success: number;
};
