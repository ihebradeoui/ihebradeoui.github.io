import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { IEmployees } from 'src/app/Models/Employes';
import { NewEmployeeComponent } from '../popups/new-employee/new-employee.component';

@Component({
  selector: 'app-employees',
  templateUrl: './employees.component.html',
  styleUrls: ['./employees.component.scss']
})

export class EmployeesComponent implements OnInit {

  displayedColumns: string[] = ['id', 'fullname', 'function', 'email','phone','departement'];
  dataSource = new MatTableDataSource<IEmployees>(ELEMENT_DATA);
  @ViewChild(MatPaginator) paginator: MatPaginator | any;
  constructor(public dialog: MatDialog) {}

  ngOnInit(): void {}
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  open_dialog_for_new_employee() {
    this.dialog.open(NewEmployeeComponent);
  }
}

const ELEMENT_DATA: IEmployees[] = [
  {id: '1', fullname:"Hadj Hassine Jawher", function: 'Developer', email:"j.hadjhassine@certeurope.fr",phone:'29 698 907', departement:{id:'1',name:'R&D'}},
  {id: '2', fullname:"Hadj Hassine Jawher", function: 'Developer', email:"j.hadjhassine@certeurope.fr",phone:'29 698 907', departement:{id:'1',name:'R&D'}},
  {id: '3', fullname:"Hadj Hassine Jawher", function: 'Developer', email:"j.hadjhassine@certeurope.fr",phone:'29 698 907', departement:{id:'1',name:'R&D'}},
  {id: '4', fullname:"Hadj Hassine Jawher", function: 'Developer', email:"j.hadjhassine@certeurope.fr",phone:'29 698 907', departement:{id:'1',name:'R&D'}},
  {id: '5', fullname:"Hadj Hassine Jawher", function: 'Developer', email:"j.hadjhassine@certeurope.fr",phone:'29 698 907', departement:{id:'1',name:'R&D'}},  
];