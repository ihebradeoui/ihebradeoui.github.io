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
  tabs: Array<string> = [];
  profilePhotoUrl;
  userToAdd;
  constructor(
    private userService: UserService,
    private auth: AuthService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.getProfilePhoto();
  }
  getProfilePhoto() {
    this.auth.currentUser.subscribe(
      (user) => {
        console.log("current email: " + user.email)
        this.userService
          .getUserByEmail(user.email)
          .subscribe((fullUser) => {
            console.log(fullUser);
            console.log(fullUser[0].data.profilePhoto);
            this.profilePhotoUrl = fullUser[0].data.profilePhoto;
            // this.sanitizer.bypassSecurityTrustResourceUrl(
            //   `data:image/png;base64, ${user[0].data.profilePhoto}`
            // );
          });
      }
    )

  }

  addTab(userToAd) {
    // console.log(userToAd)
    this.userService.getUserByEmail(userToAd).subscribe((user) => {
      if (user) {
        console.log(user)
        this.tabs.push(user[0].data.email)
      }
      else
        console.log("user not found")
    }
    )
    this.userToAdd = "";
  }
}
