import { Structure } from './Structure.js'

export class Node extends Structure {
  constructor(def, x, y, scene) {
    super(def, x, y, scene, false)
  }
}
