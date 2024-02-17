import { Component } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { AngularFireDatabase } from "@angular/fire/compat/database";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent {
  title = "the_project";
  message = "";
  data: any;
  constructor(private db: AngularFireDatabase) {}
  ngOnInit(): void {
    const ref = this.db.list("items");
    ref.valueChanges().subscribe((data) => {
      this.data = data;
    });
  }

  public async slurp() {
    const response = await fetch("https://api.github.com/users/github");
    const data = response.json();

    console.log(data);
  }
}
