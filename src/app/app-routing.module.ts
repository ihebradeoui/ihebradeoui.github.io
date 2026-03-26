import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { PlanetsComponent } from './planets/planets.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { AboutComponent } from './about/about.component';
import { LandingComponent } from './landing/landing.component';
import { ContactComponent } from './contact/contact.component';
import { TermsComponent } from './terms/terms.component';

const routes: Routes = [
  {path: '', component: LandingComponent},
  {path: 'play', component: PlanetsComponent},
  {path: 'home', component: HomeComponent},
  {path: 'planets', redirectTo: 'play', pathMatch: 'full'},
  {path: 'about', component: AboutComponent},
  {path: 'privacy-policy', component: PrivacyPolicyComponent},
  {path: 'contact', component: ContactComponent},
  {path: 'terms', component: TermsComponent},
  {path: '**', component: NotFoundComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
