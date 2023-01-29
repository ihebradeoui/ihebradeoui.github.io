import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './Components/dashboard/dashboard.component';
import { DepartementsComponent } from './Components/departements/departements.component';
import { EmployeesComponent } from './Components/employees/employees.component';
import { InformationComponent } from './Components/information/information.component';
import { LoginComponent } from './Components/login/login.component';
import { RequestsComponent } from './Components/requests/requests.component';

const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: 'employees', component: EmployeesComponent },
  { path: 'requests', component: RequestsComponent },
  { path: 'information', component: InformationComponent },
  { path: 'departements', component: DepartementsComponent },
  { path: 'login', component: LoginComponent }  
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
