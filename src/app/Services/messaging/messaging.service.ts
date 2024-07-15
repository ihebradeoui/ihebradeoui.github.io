import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { distinctUntilChanged, distinctUntilKeyChanged, map, merge, Observable, scan, switchMap, timestamp } from 'rxjs';
import { Message } from 'src/app/Models/message';
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root'
})
export class MessagingService {

  messageList: AngularFireList<any>;

  itemsCollection: AngularFirestoreCollection<any>;
  items: Observable<any[]>;

  constructor(private db: AngularFireDatabase, private afs: AngularFirestore) {
    this.messageList = db.list("items");
  }

  createmessage(message: Message) {
    this.afs.collection('items')
      .add({
        from: message.from,
        to: message.to,
        content: message.content,
        timestamp: message.timestamp
      })
      .catch((error) => {
        console.error(error);
      });
  }
  getmessages(): Observable<any> {
    return this.db.list("messages").snapshotChanges();
  }

  getmessageById(id: any): Observable<any> {
    return this.db
      .list("items", (ref) => ref.orderByKey().equalTo(id))
      .snapshotChanges();
  }
  getmessageBySender(sender: any): Observable<any> {
    return this.db
      .list("items", (ref) => ref.orderByChild("from").equalTo(sender))
      .snapshotChanges();
  }
  getmessageBySenderAndReceiver(sender: any, receiver: any): Observable<Message[]> {
    const query1 = this.afs.collection('items', ref =>
      ref.where('from', '==', sender).where('to', '==', receiver).orderBy('timestamp', 'asc')
    ).snapshotChanges();

    const query2 = this.afs.collection('items', ref =>
      ref.where('from', '==', receiver).where('to', '==', sender).orderBy('timestamp', 'asc')
    ).snapshotChanges();

    return merge(
      query1,
      query2
    ).pipe(
      map(actions => actions.map(action => ({
        id: action.payload.doc.id,
        ...(action.payload.doc.data() as Message)
      }))),
      scan((acc, val) => {
        const uniqueMessages = val.filter(
          (message) => !acc.some((m) => m.id === message.id)
        );
        return [...acc, ...uniqueMessages].sort((a, b) => a.timestamp - b.timestamp);
      }, []),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
    );
  }
}
