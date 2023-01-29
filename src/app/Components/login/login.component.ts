import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/Services/Authentication/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  form: FormGroup ;
  constructor(private fb: FormBuilder,private auth : AuthService,private router:Router) { 
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  ngOnInit(): void {
  }

  Submit(){
   this.auth.SignInUser(this.form.get("email").value,this.form.get("password").value).then(
    () => {
        this.router.navigate(['/requests'])
    },
    (error) =>{
        console.log(error)
    })
  }
}
