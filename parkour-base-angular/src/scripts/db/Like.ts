import { Timestamp } from "firebase/firestore";

export module Like {
  export class Class {}

  export interface Schema {
    time: Timestamp;
    user: {
      uid: string;
    };
  }
}
