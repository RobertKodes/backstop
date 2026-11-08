// Launch wizard form parsing/validation on top of the SDK's validateLaunchParams.

import { type LaunchParams, validateLaunchParams } from "@backstop/sdk";

import { SOL_DECIMALS, TOKEN_DECIMALS, parseUnits } from "./format";

export interface LaunchForm {
  name: string;
  symbol: string;
  uri: string;
  supply: string;
  creatorPct: string;
  liquiditySol: string;
}

export type FieldKey = keyof LaunchForm;

/** Parse the form into SDK launch params and map every problem to its field. */
export function checkLaunchForm(f: LaunchForm): {
  params: LaunchParams | null;
  errors: Partial<Record<FieldKey, string>>;
} {
  const errors: Partial<Record<FieldKey, string>> = {};
  const supply = parseUnits(f.supply, TOKEN_DECIMALS);
  const pctOk = /^\d+(\.\d{1,2})?$/.test(f.creatorPct.trim());
  const creatorBps = pctOk ? Math.round(Number(f.creatorPct.trim()) * 100) : NaN;
  const liquidity = parseUnits(f.liquiditySol, SOL_DECIMALS);
  if (supply === null) errors.supply = "Enter a whole number of tokens.";
  if (!pctOk) errors.creatorPct = "Enter a percentage between 0 and 5, up to 2 decimals.";
  if (liquidity === null) errors.liquiditySol = "Enter an amount of SOL.";
  const params: LaunchParams = {
    name: f.name,
    symbol: f.symbol,
    uri: f.uri.trim(),
    supply: supply ?? 0n,
    creatorBps: Number.isFinite(creatorBps) ? creatorBps : 0,
    liquidityLamports: liquidity ?? 0n,
  };
  for (const msg of validateLaunchParams(params)) {
    const key: FieldKey | null = msg.startsWith("Name")
      ? "name"
      : msg.startsWith("Symbol")
        ? "symbol"
        : msg.startsWith("Metadata")
          ? "uri"
          : msg.startsWith("Supply")
            ? "supply"
            : msg.startsWith("Creator")
              ? "creatorPct"
              : msg.startsWith("Initial liquidity")
                ? "liquiditySol"
                : null;
    if (key && !errors[key]) errors[key] = msg;
  }
  if (f.uri.trim() && !/^(https?|ipfs|ar):\/\//.test(f.uri.trim()))
    errors.uri = errors.uri ?? "Use an https://, ipfs:// or ar:// link to the metadata JSON.";
  return { params: Object.keys(errors).length ? null : params, errors };
}
