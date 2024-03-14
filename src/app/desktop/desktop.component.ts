import { Component, OnInit } from "@angular/core";
import { UserService } from "../user.service";
import { AuthService } from "../auth.service";
import { DomSanitizer } from "@angular/platform-browser";

@Component({
  selector: "app-desktop",
  templateUrl: "./desktop.component.html",
  styleUrls: ["./desktop.component.css"],
})
export class DesktopComponent implements OnInit {
  tabs: Array<number> = [];
  profilePhotoUrl;
  constructor(
    private userService: UserService,
    private auth: AuthService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.getProfilePhoto();
  }
  getProfilePhoto() {
    this.userService
      .getUserByEmail(this.auth.CurrentUserEmail())
      .subscribe((user) => {
        console.log(user);
        console.log(user[0].data.profilePhoto);
        this.profilePhotoUrl = user[0].data.profilePhoto;
        // this.sanitizer.bypassSecurityTrustResourceUrl(
        //   `data:image/png;base64, ${user[0].data.profilePhoto}`
        // );
      });
  }

  add() {
    this.tabs.push(this.tabs.length);
  }
}
