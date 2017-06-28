export interface Serializable {
  serialize(): object | string | number | boolean;
  deserialize(bundle: object | string | number | boolean): void
}
