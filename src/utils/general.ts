export const isTypeOne = <T1, T2>(val: T1 | T2, cond: boolean): val is T1 => cond;


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







