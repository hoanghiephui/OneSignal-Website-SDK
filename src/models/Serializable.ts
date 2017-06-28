export interface Serializable<T> {
  serialize(): object | string | number | boolean;
  deserialize(bundle: object | string | number | boolean): void
}
