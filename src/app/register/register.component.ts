import { Component, OnInit } from '@angular/core';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/compat/database';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { User } from '../user';
import { UserService } from '../user.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  registerForm :FormGroup
  errorMessage: any;
  userList: AngularFireList<any> 

  constructor(private fb:FormBuilder,private authservice:AuthService,private router:Router,
    private db:AngularFireDatabase , private userService:UserService) { 
      this.userList = db.list('users')
    }

  ngOnInit(): void {
    this.initRegisterForm();
  }

  initRegisterForm()
  {
    this.registerForm=this.fb.group(
      {
        firstName: new FormControl('',
        [Validators.required,
        Validators.minLength(3),
        Validators.maxLength(15),
        Validators.pattern(('[a-zA-Z ]+'))
      ]),
        lastName: new FormControl('',
        [Validators.required,
        Validators.minLength(3),
        Validators.maxLength(15),
        Validators.pattern(('[a-zA-Z ]+'))]),
        email:new FormControl('',
        [Validators.required,
        Validators.email]),
        phone: new FormControl('',[
          Validators.required,
          Validators.pattern("[0-9]+"),
          Validators.minLength(8),
          Validators.maxLength(13)
        ]),
        password:new FormControl('',
        [Validators.required,
        Validators.minLength(6)]),
        confirmPassword:new FormControl('',
        [Validators.required,
        Validators.minLength(6)])
      }
    );
  }
get email()
{return this.registerForm?.get('email')}

get password()
{return this.registerForm?.get('password')}

get firstName()
{return this.registerForm?.get('firstName')}

get lastName()
{return this.registerForm?.get('lastName')}

get phone()
{return this.registerForm?.get('phone')}

get confirmPassword()
{return this.registerForm?.get('confirmPassword')}

register()
{
  const email=this.registerForm.get('email').value;
  const password=this.registerForm.get('password').value;
  this.authservice.CreateNewUser(email,password).then(
    ()=>{
      this.userService.createUser(new User(
        this.email.value,
        this.firstName.value,
        this.lastName.value,
        this.phone.value
      ))
      this
      this.router.navigate(['/'])
    },
    (error)=>
    {
      this.errorMessage=error
      console.log(this.errorMessage)
    } 
  )
}
pushUser() {
  let create = 'false';
          this.userList.push({
          email: this.email,
          firstname: this.firstName ,
          lastname: this.lastName ,
          phone: this.phone,
        
            }).then(added =>{
              this.router.navigate(['/'])  
  }).catch(error=>{
    console.error(error)
  })
  
 /*
  this.condactor = new Conductor(this.lastname,this.firstname,this.phone,this.address);
 
  console.log(this.condactor)
  this.conductorservice.createConductor(this.condactor)
  */
}
}