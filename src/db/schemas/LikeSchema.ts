import { Timestamp } from "firebase/firestore";

export interface LikeSchema {
  time: Timestamp;
  user: {
    uid: string;
  };
}
