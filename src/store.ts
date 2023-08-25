import { JSONArray, JSONObject, JSONPrimitive, JSONValue } from "./json-types";
import "reflect-metadata";

const RESTRICT_METADATA_KEY = Symbol("restrict");

export type Permission = "r" | "w" | "rw" | "none";
export type StoreResult = Store | JSONPrimitive | undefined;
export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

type StoreValueObject = Store | JSONObject | undefined;
type RestrictMetadata = { canRead: boolean; canWrite: boolean } | undefined;

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export function Restrict(...params: Permission[]): any {
  const canRead =
    params.some((param) => param.includes("r")) && !params.includes("none");
  const canWrite =
    params.some((param) => param.includes("w")) && !params.includes("none");

  return params.length > 0
    ? Reflect.metadata(RESTRICT_METADATA_KEY, { canRead, canWrite })
    : () => {};
}

export class Store implements IStore {
  [index: string]: unknown;
  defaultPolicy: Permission = "rw";

  canReadByDefault = () => this.defaultPolicy.includes("r");
  canWriteByDefault = () => this.defaultPolicy.includes("w");

  allowedToRead(key: string): boolean {
    const metaData = Reflect.getMetadata(
      RESTRICT_METADATA_KEY,
      this,
      key
    ) as RestrictMetadata;

    return metaData ? metaData.canRead : this.canReadByDefault();
  }

  allowedToWrite(key: string): boolean {
    const metaData = Reflect.getMetadata(
      RESTRICT_METADATA_KEY,
      this,
      key
    ) as RestrictMetadata;

    return metaData ? metaData.canWrite : this.canWriteByDefault();
  }

  read(path: string): StoreResult {
    return path.split(":").reduce<StoreValueObject>((current, key) => {
      const isStore = current instanceof Store;
      const property = current ? current[key] : undefined;

      if (isStore && !current.allowedToRead(key)) {
        throw new Error(`Property ${key} is not readable`);
      }

      return isStore && typeof property === "function" ? property() : property;
    }, this) as StoreResult;
  }

  write<T extends StoreValue>(path: string, value: T): T {
    const keys = path.split(":");
    const lastKey = keys.pop() as string;
    const parent = keys.length === 0 ? this : this.read(keys.join(":"));

    if (!parent || typeof parent !== "object") {
      throw new Error("A value indexed by the path is not an object or Store");
    }
    if (parent instanceof Store && !parent.allowedToWrite(lastKey)) {
      throw new Error(`Property ${lastKey} is not writable`);
    }

    if (parent) parent[lastKey] = value;

    return value;
  }

  writeEntries(entries: JSONObject): void {
    Object.entries(entries).forEach(([key, value]) => this.write(key, value));
  }

  entries(): JSONObject {
    return Object.entries(this).reduce<JSONObject>((entries, [key, value]) => {
      if (this.allowedToRead(key)) {
        entries[key] =
          value instanceof Store ? value.entries() : (value as JSONValue);
      }

      return entries;
    }, {});
  }
}
