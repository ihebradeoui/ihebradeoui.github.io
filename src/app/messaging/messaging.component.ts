import {
  AfterViewChecked,
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild
} from "@angular/core";
import { AngularFireDatabase } from "@angular/fire/compat/database";
import { Timestamp } from 'firebase/firestore';
import { FormGroup } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../auth.service";
import { MessagingService } from "../Services/messaging/messaging.service";
import { Message } from "../Models/message";
import { UserService } from "../user.service";

@Component({
  selector: "app-messaging",
  templateUrl: "./messaging.component.html",
  styleUrls: ["./messaging.component.css"],
})
export class MessagingComponent implements OnInit, AfterViewChecked {
  @Input() receiver = '';
  title = "the_project";
  messageForm: FormGroup;
  message = "";
  data: any;
  tabs: Array<string> = [];
  user: any;
  @ViewChild("chatBox", { static: false }) chatBox: ElementRef;
  constructor(
    private router: Router,
    private db: AngularFireDatabase,
    private auth: AuthService,
    private messagingService: MessagingService,
    private userService: UserService) {
    this.auth.currentUser.subscribe((user) => {
      this.user = user.email;
    });
    console.log(this.receiver)
  }
  ngOnInit(): void {
    if (this.auth.Auth().currentUser == null) this.router.navigate(["/"]);
    this.auth.currentUser.subscribe((user) => {
      this.messagingService.getmessageBySenderAndReceiver(user.email, this.receiver).subscribe((data) => {
        this.data = data;
      });
    })
    this.ScrollDownMessageBox();

  }
  ngAfterViewChecked(): void {
    this.ScrollDownMessageBox();
  }
  public send() {
    console.log(this.receiver)
    this.auth.currentUser.subscribe((user) => {
      this.messagingService.createmessage(new Message(
        user.email, this.receiver, this.message, Timestamp.now().toMillis().toString()
      ))
      this.message = "";
    })
  }
  ScrollDownMessageBox() {
    this.chatBox.nativeElement.scrollTop =
      this.chatBox.nativeElement.scrollHeight;
  }
  public async slurp() {
    const response = await fetch("https://api.github.com/users/github");
    const data = response.json();
    console.log(data);
  }
}
