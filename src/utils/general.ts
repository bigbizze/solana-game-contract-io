import { Result } from "../shared-types";


export const isTypeOne = <T1, T2>(val: T1 | T2, cond: boolean): val is T1 => cond;

export const sleep = async (duration: number) => await new Promise(r => setTimeout(r, duration));

export const unwrapResult = <T>(result: Result<T>): T => {
  if (result instanceof Error) {
    console.error(result);
    process.exit(1);
  }
  return result;
};

export const catchWrapper = async <T>(fn: () => Promise<T>) => {
  try {
    const match = await fn();
    if (match instanceof Error) {
      return new Error(`${ fn.name } returned ${ typeof match } result!\n${ match }`);
    }
    return match;
  } catch (e) {
    if (e instanceof Error) {
      return e;
    } else if (typeof e === "string") {
      return new Error(e);
    } else {
      return new Error("Couldn't get match");
    }
  }
};







