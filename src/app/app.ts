import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GlbViewerComponent } from './glb-viewer/glb-viewer.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, GlbViewerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
