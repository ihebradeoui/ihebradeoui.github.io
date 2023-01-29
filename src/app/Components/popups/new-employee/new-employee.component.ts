import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-new-employee',
  templateUrl: './new-employee.component.html',
  styleUrls: ['./new-employee.component.scss']
})
export class NewEmployeeComponent implements OnInit {
  form: FormGroup ;

  constructor(private fb: FormBuilder) { 
    this.form = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      function: ['', Validators.required],
      phone: ['', Validators.required],
      departement: ['', Validators.required],
      manager: ['', Validators.required],
      country: ['', Validators.required]
    });
  }
 
  ngOnInit(): void {}
  Submit(){
    console.log(this.form.value)
  }

}
