import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { ButtonModule } from "primeng/button";
import {
  FormGroup,
  FormBuilder,
  FormControl,
  Validators,
} from "@angular/forms";

import { AuthService } from "../auth.service";
import { DaysOffService } from "../Services/days-off.service";
@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.css"],
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMessage: any;

  constructor(
    private fb: FormBuilder,
    private authservice: AuthService,
    private router: Router,
    private daysOffService: DaysOffService
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm() {
    this.loginForm = this.fb.group({
      email: new FormControl("", [Validators.required, Validators.email]),
      password: new FormControl("", [
        Validators.required,
        Validators.minLength(6),
      ]),
    });
  }

  get email() {
    return this.loginForm.get("email");
  }

  get password() {
    return this.loginForm.get("password");
  }

  login() {
    const email = this.loginForm.get("email").value;
    const password = this.loginForm.get("password").value;
    console.log(email + password);
    this.authservice.SignInUser(email, password).then(
      () => {
        this.router.navigate(["/messaging"]);
      },
      (error) => {
        this.errorMessage = error;
        console.log(this.errorMessage);
      }
    );
  }
}
