import { AfterViewChecked, Component, OnInit } from "@angular/core";
import { AngularFireDatabase } from "@angular/fire/compat/database";
import { FormGroup } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../auth.service";

@Component({
  selector: "app-messaging",
  templateUrl: "./messaging.component.html",
  styleUrls: ["./messaging.component.css"],
})
export class MessagingComponent implements OnInit, AfterViewChecked {
  title = "the_project";
  messageForm: FormGroup;
  message = "";
  data: any;
  tabs: Array<number> = [1];
  constructor(
    private router: Router,
    private db: AngularFireDatabase,
    private auth: AuthService
  ) {}
  ngOnInit(): void {
    if (this.auth.Auth().currentUser == null) this.router.navigate(["/"]);
    const ref = this.db.list("items");
    ref.valueChanges().subscribe((data) => {
      this.data = data;
    });
    this.ScrollDownMessageBox();
  }
  addTab() {
    this.tabs.push(this.tabs[this.tabs.length - 1] + 1);
    console.log(this.tabs);
  }
  ngAfterViewChecked(): void {
    this.ScrollDownMessageBox();
  }
  public send() {
    const ref = this.db.list("items");
    console.log(this.auth.CurrentUserEmail().split("@")[0]);
    ref
      .push(this.auth.CurrentUserEmail().split("@")[0] + " : " + this.message)
      .then(() => {
        this.ScrollDownMessageBox();
      })
      .catch((error) => {
        console.log(error);
      });
    this.message = "";
  }
  ScrollDownMessageBox() {
    var elem = document.getElementById("div");
    elem.scrollTop = elem.scrollHeight;
  }
  public async slurp() {
    const response = await fetch("https://api.github.com/users/github");
    const data = response.json();
    console.log(data);
  }
}
