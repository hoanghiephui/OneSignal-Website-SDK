export interface Serializable<T> {
  serialize(): object
  deserialize(bundle: object): T
}
