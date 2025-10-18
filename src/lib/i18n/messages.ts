export const COPY = {
  homeNetworkNotice: "テストネット用のETHが少し必要です（手数料）",
  sendHelp: "あて先と金額を入れるだけ。全額は右のボタンが便利です",
  feeNote: "ネットワークの利用料です。混雑で少し変わります。",
  sendComplete: "送れました。まもなく相手に届きます",
} as const;

export const ERRORS = {
  recipientInvalid: "あて先が正しくありません",
  balanceInsufficient: "残高が足りません",
  gasInsufficient: "手数料用のテストETHが不足しています",
  networkUnstable: "電波が弱いかもしれません。Wi-Fiをお試しください",
} as const;
