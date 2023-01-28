import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { Requests } from 'src/app/Models/Requests';

@Component({
  selector: 'app-requests',
  templateUrl: './requests.component.html',
  styleUrls: ['./requests.component.scss']
})
export class RequestsComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }
  
  displayedColumns: string[] = ['id', 'employee_name', 'start_date', 'end_date','treated_by','leave_type','request_status'];
  dataSource = new MatTableDataSource<Requests>(ELEMENT_DATA);
  @ViewChild(MatPaginator) paginator: MatPaginator | any;

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

}

const ELEMENT_DATA: Requests[] = [
{id: '1', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '2', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '3', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '4', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '5', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '6', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '7', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'},
{id: '8', employee_name:"Hadj Hassine Jawher", start_date: '01-01-2023',end_date:"03-01-2023",treated_by:'Med Aziz Hannafi',leave_type:'Illness',request_status:'In progress'}
];