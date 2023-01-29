import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { User } from 'src/app/Models/User';
import { UserService } from 'src/app/Services/user.service';
import { NewEmployeeComponent } from '../popups/new-employee/new-employee.component';

@Component({
  selector: 'app-employees',
  templateUrl: './employees.component.html',
  styleUrls: ['./employees.component.scss']
})

export class EmployeesComponent implements OnInit {

  users = []
  displayedColumns: string[] = ['id', 'firstname', 'lastname', 'email','phone'];
  dataSource = new MatTableDataSource<User>(this.users);
  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  constructor(public dialog: MatDialog ,private  usersService : UserService) {}

  ngOnInit(): void {
    this.dataSource.paginator = this.paginator;
    this.usersService.getUsers().subscribe((data)=>this.listUsers(data))
    
  }
  ngAfterViewInit() {
  }

  open_dialog_for_new_employee() {
    this.dialog.open(NewEmployeeComponent);
  }

  listUsers(entries: any[]){
    this.users = [];
    entries.forEach(element => {
     let y = element.payload.toJSON()
     y["$key"] = element.key
     this.users.push(y as User)
      })
      this.dataSource=new MatTableDataSource<User>(this.users);
      console.log(this.users)
    }
}