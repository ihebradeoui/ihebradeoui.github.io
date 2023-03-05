import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainSceneComponent } from './main-scene/main-scene.component';

const routes: Routes = [
  {path:"",component: MainSceneComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
  
})
export class AppRoutingModule { }
