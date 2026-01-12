import { Component } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatExpansionModule } from "@angular/material/expansion";
import { RouterLink } from "@angular/router";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  icon: string;
  items: FaqItem[];
}

@Component({
  selector: "app-support-page",
  templateUrl: "./support-page.component.html",
  styleUrls: ["./support-page.component.scss"],
  imports: [
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    RouterLink,
  ],
})
export class SupportPageComponent {
  readonly faqCategories: FaqCategory[] = [
    {
      title: "Account & Profile",
      icon: "person",
      items: [
        {
          question: "How do I delete my account?",
          answer:
            "Go to Settings > Account > Delete Account. You'll be asked to confirm this action. Note that this will permanently delete all your data and cannot be undone.",
        },
        {
          question: "How do I change my email address?",
          answer:
            "Go to Settings > Account and you'll find the option to update your email address. You'll need to verify the new email before the change takes effect.",
        },
        {
          question: "I can't verify my email, what do I do?",
          answer:
            "Check your spam folder first. If you still can't find the verification email, go to Settings > Account and request a new verification email. If problems persist, contact us on Discord.",
        },
        {
          question: "How do I change my profile picture?",
          answer:
            "Tap on your profile picture in your profile page, and you can select a new image from your device.",
        },
      ],
    },
    {
      title: "Using the Map",
      icon: "map",
      items: [
        {
          question: "How do I add a new spot?",
          answer:
            "Tap the '+' button on the map when zoomed in close enough. Place the marker at the spot location, fill in the details like name, description, and amenities, then submit for review.",
        },
        {
          question: "How do I report or edit an incorrect spot?",
          answer:
            "Open the spot details and tap the edit icon. You can suggest changes which will be reviewed by the community. For serious issues, use the report button.",
        },
        {
          question: "What are the map filters?",
          answer:
            "Filters let you find spots with specific features like being covered from rain, lit at night, indoor, or having specific amenities. Access them from the filter button on the map.",
        },
        {
          question: "Why can't I see any spots in my area?",
          answer:
            "PK Spot relies on community contributions. If there are no spots in your area yet, be the first to add them! You can also import spots from a KML file if you have one.",
        },
      ],
    },
    {
      title: "App & Technical",
      icon: "phone_iphone",
      items: [
        {
          question: "The app is crashing, what should I do?",
          answer:
            "Try clearing the app cache or reinstalling. If problems persist, please report the issue on our Discord with details about your device and what you were doing when it crashed.",
        },
        {
          question: "How do I install the app on my phone?",
          answer:
            "PK Spot is available on iOS and Android. You can also install it as a Progressive Web App (PWA) by opening the menu in your browser and selecting 'Add to Home Screen' or 'Install'.",
        },
        {
          question: "Is my data safe?",
          answer:
            "Yes! We take privacy seriously. We don't sell your data and use industry-standard security. Check our Privacy Policy for full details.",
        },
      ],
    },
  ];

  readonly discordUrl = "https://discord.gg/Th5vx4KnQb";
  readonly instagramUrl = "https://instagram.com/pkspot.app";
  readonly supportEmail = "contact@lukasbuehler.ch";
}
