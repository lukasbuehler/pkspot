const fs = require("fs");
const path = require("path");

const files = [
  "src/locale/messages.de.xlf",
  "src/locale/messages.es.xlf",
  "src/locale/messages.fr.xlf",
  "src/locale/messages.it.xlf",
  "src/locale/messages.nl.xlf",
  "src/locale/messages.de-CH.xlf",
];

const translations = {
  " Account ": {
    de: " Konto ",
    es: " Cuenta ",
    fr: " Compte ",
    it: " Account ",
    nl: " Account ",
  },
  " Are you sure? Enter your password to confirm deletion. ": {
    de: " Bist du sicher? Gib dein Passwort ein, um das Löschen zu bestätigen. ",
    es: " ¿Estás seguro? Ingresa tu contraseña para confirmar la eliminación. ",
    fr: " Êtes-vous sûr ? Entrez votre mot de passe pour confirmer la suppression. ",
    it: " Sei sicuro? Inserisci la tua password per confermare l'eliminazione. ",
    nl: " Weet je het zeker? Voer je wachtwoord in om de verwijdering te bevestigen. ",
  },
  ' Are you sure? You will need to sign in with <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> again to confirm deletion. ':
    {
      de: ' Bist du sicher? Du musst dich erneut mit <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> anmelden, um das Löschen zu bestätigen. ',
      es: ' ¿Estás seguro? Deberás iniciar sesión con <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> nuevamente para confirmar la eliminación. ',
      fr: ' Êtes-vous sûr ? Vous devrez vous reconnecter avec <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> pour confirmer la suppression. ',
      it: ' Sei sicuro? Dovrai accedere nuovamente con <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> per confermare l\'eliminazione. ',
      nl: ' Weet je het zeker? Je moet opnieuw inloggen met <ph id="0" equiv="INTERPOLATION" disp="{{ providerDisplayName }}"/> om de verwijdering te bevestigen. ',
    },
  ' Can&apos;t find what you&apos;re looking for? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">Join our Discord</pc> and we&apos;ll help you out! ':
    {
      de: ' Findest du nicht, was du suchst? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">Tritt unserem Discord bei</pc> und wir helfen dir weiter! ',
      es: ' ¿No encuentras lo que buscas? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">¡Únete a nuestro Discord</pc> y te ayudaremos! ',
      fr: ' Vous ne trouvez pas ce que vous cherchez ? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">Rejoignez notre Discord</pc> et nous vous aiderons ! ',
      it: ' Non trovi quello che cerchi? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">Unisciti al nostro Discord</pc> e ti aiuteremo! ',
      nl: ' Kun je niet vinden wat je zoekt? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a [href]=&quot;discordUrl&quot; target=&quot;_blank&quot;&gt;" dispEnd="&lt;/a&gt;">Word lid van onze Discord</pc> en we helpen je verder! ',
    },
  " Check your inbox and follow the instructions to reset your password. ": {
    de: " Überprüfe deinen Posteingang und folge den Anweisungen, um dein Passwort zurückzusetzen. ",
    es: " Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña. ",
    fr: " Vérifiez votre boîte de réception et suivez les instructions pour réinitialiser votre mot de passe. ",
    it: " Controlla la tua casella di posta e segui le istruzioni per reimpostare la tua password. ",
    nl: " Controleer je inbox en volg de instructies om je wachtwoord opnieuw in te stellen. ",
  },
  " Community &amp; Contribution ": {
    de: " Community &amp; Beitrag ",
    es: " Comunidad y Contribución ",
    fr: " Communauté et Contribution ",
    it: " Comunità e Contributo ",
    nl: " Gemeenschap & Bijdrage ",
  },
  " Delete my account ": {
    de: " Mein Konto löschen ",
    es: " Eliminar mi cuenta ",
    fr: " Supprimer mon compte ",
    it: " Elimina il mio account ",
    nl: " Verwijder mijn account ",
  },
  " Description ": {
    de: " Beschreibung ",
    es: " Descripción ",
    fr: " Description ",
    it: " Descrizione ",
    nl: " Beschrijving ",
  },
  " Edit ": {
    de: " Bearbeiten ",
    es: " Editar ",
    fr: " Modifier ",
    it: " Modifica ",
    nl: " Bewerken ",
  },
  " Enter your E-mail address and you will receive an E-mail with instructions to reset your password. ":
    {
      de: " Gib deine E-Mail-Adresse ein und du erhältst eine E-Mail mit Anweisungen zum Zurücksetzen deines Passworts. ",
      es: " Ingresa tu dirección de correo electrónico y recibirás un correo con instrucciones para restablecer tu contraseña. ",
      fr: " Entrez votre adresse e-mail et vous recevrez un e-mail avec des instructions pour réinitialiser votre mot de passe. ",
      it: " Inserisci il tuo indirizzo e-mail e riceverai un'e-mail con le istruzioni per reimpostare la tua password. ",
      nl: " Voer je e-mailadres in en je ontvangt een e-mail met instructies om je wachtwoord opnieuw in te stellen. ",
    },
  " Feel free to slide into our DMs! We&apos;re happy to help with quick questions. ":
    {
      de: " Schreib uns gerne eine DM! Wir helfen dir gerne bei kurzen Fragen. ",
      es: " ¡No dudes en enviarnos un DM! Estaremos encantados de ayudarte con preguntas rápidas. ",
      fr: " N'hésitez pas à nous envoyer un DM ! Nous sommes heureux de répondre à vos questions rapides. ",
      it: " Sentiti libero di scriverci in DM! Siamo felici di aiutarti con domande veloci. ",
      nl: " Stuur ons gerust een DM! We helpen je graag met snelle vragen. ",
    },
  " Find answers to common questions or reach out to us directly. ": {
    de: " Finde Antworten auf häufige Fragen oder kontaktiere uns direkt. ",
    es: " Encuentra respuestas a preguntas frecuentes o contáctanos directamente. ",
    fr: " Trouvez des réponses aux questions courantes ou contactez-nous directement. ",
    it: " Trova risposte alle domande comuni o contattaci direttamente. ",
    nl: " Vind antwoorden op veelgestelde vragen of neem direct contact met ons op. ",
  },
  " For formal inquiries, partnerships, or issues that require privacy, reach out via email. ":
    {
      de: " Für formelle Anfragen, Partnerschaften oder Themen, die Privatsphäre erfordern, kontaktiere uns per E-Mail. ",
      es: " Para consultas formales, asociaciones o asuntos que requieran privacidad, contáctanos por correo electrónico. ",
      fr: " Pour les demandes formelles, les partenariats ou les problèmes nécessitant de la confidentialité, contactez-nous par e-mail. ",
      it: " Per richieste formali, partnership o questioni che richiedono privacy, contattaci via email. ",
      nl: " Voor formele vragen, partnerschappen of kwesties die privacy vereisen, neem contact op via e-mail. ",
    },
  " Forgot password ": {
    de: " Passwort vergessen ",
    es: " Contraseña olvidada ",
    fr: " Mot de passe oublié ",
    it: " Password dimenticata ",
    nl: " Wachtwoord vergeten ",
  },
  " Frequently Asked Questions ": {
    de: " Häufig gestellte Fragen ",
    es: " Preguntas Frecuentes ",
    fr: " Foire Aux Questions ",
    it: " Domande Frequenti ",
    nl: " Veelgestelde Vragen ",
  },
  " Have a question, found a bug, or want to request a feature? We&apos;d love to hear from you! ":
    {
      de: " Hast du eine Frage, einen Fehler gefunden oder möchtest du eine Funktion anfragen? Wir würden uns freuen, von dir zu hören! ",
      es: " ¿Tienes una pregunta, encontraste un error o quieres solicitar una función? ¡Nos encantaría saber de ti! ",
      fr: " Vous avez une question, trouvé un bug ou souhaitez demander une fonctionnalité ? Nous serions ravis de vous entendre ! ",
      it: " Hai una domanda, trovato un bug o vuoi richiedere una funzionalità? Ci piacerebbe sentirti! ",
      nl: " Heb je een vraag, een bug gevonden of wil je een functie aanvragen? We horen graag van je! ",
    },
  " Join our Discord server to chat with the community, report bugs, and request features. This is the fastest way to get help! ":
    {
      de: " Tritt unserem Discord-Server bei, um mit der Community zu chatten, Fehler zu melden und Funktionen anzufragen. Das ist der schnellste Weg, um Hilfe zu erhalten! ",
      es: " Únete a nuestro servidor de Discord para chatear con la comunidad, informar errores y solicitar funciones. ¡Esta es la forma más rápida de obtener ayuda! ",
      fr: " Rejoignez notre serveur Discord pour discuter avec la communauté, signaler des bugs et demander des fonctionnalités. C'est le moyen le plus rapide d'obtenir de l'aide ! ",
      it: " Unisciti al nostro server Discord per chattare con la comunità, segnalare bug e richiedere funzionalità. Questo è il modo più veloce per ottenere aiuto! ",
      nl: " Word lid van onze Discord-server om met de community te chatten, bugs te melden en functies aan te vragen. Dit is de snelste manier om hulp te krijgen! ",
    },
  " Manage your account settings including email, password, and account deletion. ":
    {
      de: " Verwalte deine Kontoeinstellungen einschließlich E-Mail, Passwort und Kontolöschung. ",
      es: " Administra la configuración de tu cuenta, incluido el correo electrónico, la contraseña y la eliminación de la cuenta. ",
      fr: " Gérez les paramètres de votre compte, y compris l'e-mail, le mot de passe et la suppression du compte. ",
      it: " Gestisci le impostazioni del tuo account inclusi email, password ed eliminazione dell'account. ",
      nl: " Beheer je accountinstellingen, inclusief e-mail, wachtwoord en accountverwijdering. ",
    },
  " Media ": {
    de: " Medien ",
    es: " Medios ",
    fr: " Média ",
    it: " Media ",
    nl: " Media ",
  },
  ' Need help? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Visit our support page</pc>':
    {
      de: ' Brauchst du Hilfe? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Besuche unsere Support-Seite</pc>',
      es: ' ¿Necesitas ayuda? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Visita nuestra página de soporte</pc>',
      fr: ' Besoin d\'aide ? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Visitez notre page de support</pc>',
      it: ' Hai bisogno di aiuto? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Visita la nostra pagina di supporto</pc>',
      nl: ' Hulp nodig? <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/support&quot;&gt;" dispEnd="&lt;/a&gt;">Bezoek onze supportpagina</pc>',
    },
  " PK Spot is built by the community. By contributing content, you grant us the license needed to operate the service, as detailed in our Terms of Service. We then share the combined spot data back to the public under a protective, non-commercial license (CC BY-NC-SA 4.0) to keep it an open resource for everyone. ":
    {
      de: " PK Spot wird von der Community aufgebaut. Durch das Beitragen von Inhalten gewährst du uns die für den Betrieb des Dienstes erforderliche Lizenz, wie in unseren Nutzungsbedingungen beschrieben. Wir teilen die kombinierten Spot-Daten dann unter einer schützenden, nicht-kommerziellen Lizenz (CC BY-NC-SA 4.0) wieder mit der Öffentlichkeit, um sie als offene Ressource für alle zu erhalten. ",
      es: " PK Spot es construido por la comunidad. Al contribuir contenido, nos otorgas la licencia necesaria para operar el servicio, como se detalla en nuestros Términos de Servicio. Luego compartimos los datos combinados de los spots con el público bajo una licencia protectora y no comercial (CC BY-NC-SA 4.0) para mantenerlo como un recurso abierto para todos. ",
      fr: " PK Spot est construit par la communauté. En contribuant du contenu, vous nous accordez la licence nécessaire pour exploiter le service, comme détaillé dans nos Conditions d'utilisation. Nous partageons ensuite les données combinées des spots avec le public sous une licence protectrice et non commerciale (CC BY-NC-SA 4.0) pour en faire une ressource ouverte pour tous. ",
      it: " PK Spot è costruito dalla comunità. Contribuendo con contenuti, ci concedi la licenza necessaria per gestire il servizio, come dettagliato nei nostri Termini di Servizio. Condividiamo poi i dati combinati degli spot con il pubblico sotto una licenza protettiva non commerciale (CC BY-NC-SA 4.0) per mantenerlo una risorsa aperta per tutti. ",
      nl: " PK Spot wordt gebouwd door de gemeenschap. Door inhoud bij te dragen, verleen je ons de licentie die nodig is om de dienst te exploiteren, zoals gedetailleerd in onze Servicevoorwaarden. We delen de gecombineerde spotgegevens vervolgens weer met het publiek onder een beschermende, niet-commerciële licentie (CC BY-NC-SA 4.0) om het een open bron voor iedereen te houden. ",
    },
  " Permanently delete your account and all associated data. This action cannot be undone. ":
    {
      de: " Lösche dein Konto und alle zugehörigen Daten dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden. ",
      es: " Elimina permanentemente tu cuenta y todos los datos asociados. Esta acción no se puede deshacer. ",
      fr: " Supprimez définitivement votre compte et toutes les données associées. Cette action est irréversible. ",
      it: " Elimina definitivamente il tuo account e tutti i dati associati. Questa azione non può essere annullata. ",
      nl: " Verwijder je account en alle bijbehorende gegevens permanent. Deze actie kan niet ongedaan worden gemaakt. ",
    },
  " Preview ": {
    de: " Vorschau ",
    es: " Vista previa ",
    fr: " Aperçu ",
    it: " Anteprima ",
    nl: " Voorbeeld ",
  },
  " Spot URL ": {
    de: " Spot-URL ",
    es: " URL del Spot ",
    fr: " URL du Spot ",
    it: " URL dello Spot ",
    nl: " Spot-URL ",
  },
  " The page you are looking for does not exist or has been moved. ": {
    de: " Die Seite, die du suchst, existiert nicht oder wurde verschoben. ",
    es: " La página que buscas no existe o ha sido movida. ",
    fr: " La page que vous cherchez n'existe pas ou a été déplacée. ",
    it: " La pagina che stai cercando non esiste o è stata spostata. ",
    nl: " De pagina die je zoekt bestaat niet of is verplaatst. ",
  },
  " Verify now ": {
    de: " Jetzt verifizieren ",
    es: " Verificar ahora ",
    fr: " Vérifier maintenant ",
    it: " Verifica ora ",
    nl: " Nu verifiëren ",
  },
  ' in <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>': {
    de: ' in <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>',
    es: ' en <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>',
    fr: ' à <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>',
    it: ' a <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>',
    nl: ' in <ph id="0" equiv="PH" disp="challenge.spot.localityString()"/>',
  },
  "About PK Spot": {
    de: "Über PK Spot",
    es: "Sobre PK Spot",
    fr: "À propos de PK Spot",
    it: "Informazioni su PK Spot",
    nl: "Over PK Spot",
  },
  Account: {
    de: "Konto",
    es: "Cuenta",
    fr: "Compte",
    it: "Account",
    nl: "Account",
  },
  "Account mismatch. Please sign in to the correct account.": {
    de: "Kontonichtübereinstimmung. Bitte melde dich beim richtigen Konto an.",
    es: "Discrepancia de cuenta. Por favor, inicia sesión en la cuenta correcta.",
    fr: "Incompatibilité de compte. Veuillez vous connecter au bon compte.",
    it: "Discrepanza dell'account. Accedi all'account corretto.",
    nl: "Account komt niet overeen. Log in op het juiste account.",
  },
  "Add Spot": {
    de: "Spot hinzufügen",
    es: "Añadir Spot",
    fr: "Ajouter un Spot",
    it: "Aggiungi Spot",
    nl: "Spot toevoegen",
  },
  "All Event Challenges": {
    de: "Alle Event-Challenges",
    es: "Todos los Desafíos del Evento",
    fr: "Tous les défis de l'événement",
    it: "Tutte le sfide dell'evento",
    nl: "Alle evenement-uitdagingen",
  },
  "An error occurred. Please try again or request a new link.": {
    de: "Ein Fehler ist aufgetreten. Bitte versuche es erneut oder fordere einen neuen Link an.",
    es: "Ocurrió un error. Por favor intenta de nuevo o solicita un nuevo enlace.",
    fr: "Une erreur s'est produite. Veuillez réessayer ou demander un nouveau lien.",
    it: "Si è verificato un errore. Riprova o richiedi un nuovo link.",
    nl: "Er is een fout opgetreden. Probeer het opnieuw of vraag een nieuwe link aan.",
  },
  Art: { de: "Kunst", es: "Arte", fr: "Art", it: "Arte", nl: "Kunst" },
  "Authentication Error": {
    de: "Authentifizierungsfehler",
    es: "Error de autenticación",
    fr: "Erreur d'authentification",
    it: "Errore di autenticazione",
    nl: "Authenticatiefout",
  },
  "Back to Sign in": {
    de: "Zurück zur Anmeldung",
    es: "Volver a Iniciar sesión",
    fr: "Retour à la connexion",
    it: "Torna all'accesso",
    nl: "Terug naar inloggen",
  },
  "Back to sign in": {
    de: "Zurück zur Anmeldung",
    es: "Volver a Iniciar sesión",
    fr: "Retour à la connexion",
    it: "Torna all'accesso",
    nl: "Terug naar inloggen",
  },
  Badges: {
    de: "Abzeichen",
    es: "Insignias",
    fr: "Badges",
    it: "Badge",
    nl: "Badges",
  },
  'By creating an account, you agree to our <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Terms of Service</pc> and confirm you will contribute content under the license terms described within.':
    {
      de: 'Durch das Erstellen eines Kontos stimmst du unseren <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Nutzungsbedingungen</pc> zu und bestätigst, dass du Inhalte unter den darin beschriebenen Lizenzbedingungen beisteuern wirst.',
      es: 'Al crear una cuenta, aceptas nuestros <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Términos de Servicio</pc> y confirmas que contribuirás contenido bajo los términos de licencia descritos.',
      fr: 'En créant un compte, vous acceptez nos <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Conditions d\'utilisation</pc> et confirmez que vous contribuerez du contenu selon les termes de licence décrits.',
      it: 'Creando un account, accetti i nostri <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Termini di Servizio</pc> e confermi che contribuirai con contenuti secondo i termini di licenza descritti.',
      nl: 'Door een account aan te maken, ga je akkoord met onze <pc id="0" equivStart="START_LINK" equivEnd="CLOSE_LINK" type="link" dispStart="&lt;a routerLink=&quot;/terms-of-service&quot;&gt;" dispEnd="&lt;/a&gt;">Servicevoorwaarden</pc> en bevestig je dat je inhoud zult bijdragen onder de daarin beschreven licentievoorwaarden.',
    },
  "Calisthenics Park": {
    de: "Calisthenics-Park",
    es: "Parque de Calistenia",
    fr: "Parc de Calisthenics",
    it: "Parco Calisthenics",
    nl: "Calisthenics Park",
  },
  Cartographer: {
    de: "Kartograf",
    es: "Cartógrafo",
    fr: "Cartographe",
    it: "Cartografo",
    nl: "Cartograaf",
  },
  "Confirm Password": {
    de: "Passwort bestätigen",
    es: "Confirmar contraseña",
    fr: "Confirmer le mot de passe",
    it: "Conferma password",
    nl: "Bevestig wachtwoord",
  },
  "Confirm new password": {
    de: "Neues Passwort bestätigen",
    es: "Confirmar nueva contraseña",
    fr: "Confirmer le nouveau mot de passe",
    it: "Conferma nuova password",
    nl: "Bevestig nieuw wachtwoord",
  },
  Contributions: {
    de: "Beiträge",
    es: "Contribuciones",
    fr: "Contributions",
    it: "Contributi",
    nl: "Bijdragen",
  },
  "Could not sign in with Apple!": {
    de: "Anmeldung mit Apple fehlgeschlagen!",
    es: "¡No se pudo iniciar sesión con Apple!",
    fr: "Impossible de se connecter avec Apple !",
    it: "Impossibile accedere con Apple!",
    nl: "Kan niet inloggen met Apple!",
  },
  "Current E-mail": {
    de: "Aktuelle E-Mail",
    es: "Correo electrónico actual",
    fr: "E-mail actuel",
    it: "E-mail attuale",
    nl: "Huidig e-mailadres",
  },
  "Current password": {
    de: "Aktuelles Passwort",
    es: "Contraseña actual",
    fr: "Mot de passe actuel",
    it: "Password attuale",
    nl: "Huidig wachtwoord",
  },
  "Current password (for confirmation)": {
    de: "Aktuelles Passwort (zur Bestätigung)",
    es: "Contraseña actual (para confirmación)",
    fr: "Mot de passe actuel (pour confirmation)",
    it: "Password attuale (per conferma)",
    nl: "Huidig wachtwoord (ter bevestiging)",
  },
  "Current password is incorrect.": {
    de: "Das aktuelle Passwort ist falsch.",
    es: "La contraseña actual es incorrecta.",
    fr: "Le mot de passe actuel est incorrect.",
    it: "La password attuale non è corretta.",
    nl: "Het huidige wachtwoord is onjuist.",
  },
  Date: { de: "Datum", es: "Fecha", fr: "Date", it: "Data", nl: "Datum" },
  "Delete Account": {
    de: "Konto löschen",
    es: "Eliminar cuenta",
    fr: "Supprimer le compte",
    it: "Elimina account",
    nl: "Account verwijderen",
  },
  Description: {
    de: "Beschreibung",
    es: "Descripción",
    fr: "Description",
    it: "Descrizione",
    nl: "Beschrijving",
  },
  "Discord Community": {
    de: "Discord-Community",
    es: "Comunidad de Discord",
    fr: "Communauté Discord",
    it: "Comunità Discord",
    nl: "Discord Community",
  },
  "E-Mail": {
    de: "E-Mail",
    es: "Correo electrónico",
    fr: "E-mail",
    it: "E-mail",
    nl: "E-mail",
  },
  "Early Adopter": {
    de: "Early Adopter",
    es: "Early Adopter",
    fr: "Utilisateur précoce",
    it: "Early Adopter",
    nl: "Vroege gebruiker",
  },
  "Early Bird": {
    de: "Early Bird",
    es: "Madrugador",
    fr: "Lève-tôt",
    it: "Mattiniero",
    nl: "Vroege vogel",
  },
  "Edits Made": {
    de: "Bearbeitungen vorgenommen",
    es: "Ediciones realizadas",
    fr: "Modifications apportées",
    it: "Modifiche apportate",
    nl: "Gemaakte bewerkingen",
  },
  "Email Recovered": {
    de: "E-Mail wiederhergestellt",
    es: "Correo recuperado",
    fr: "E-mail récupéré",
    it: "Email recuperata",
    nl: "E-mail hersteld",
  },
  "Email Support": {
    de: "E-Mail-Support",
    es: "Soporte por correo",
    fr: "Support par e-mail",
    it: "Supporto via email",
    nl: "E-mail ondersteuning",
  },
  "Email Verified!": {
    de: "E-Mail verifiziert!",
    es: "¡Correo verificado!",
    fr: "E-mail vérifié !",
    it: "Email verificata!",
    nl: "E-mail geverifieerd!",
  },
  "Email changed successfully. Please verify your new email.": {
    de: "E-Mail erfolgreich geändert. Bitte verifiziere deine neue E-Mail.",
    es: "Correo cambiado exitosamente. Por favor verifica tu nuevo correo.",
    fr: "E-mail modifié avec succès. Veuillez vérifier votre nouvel e-mail.",
    it: "Email cambiata con successo. Verifica la tua nuova email.",
    nl: "E-mail succesvol gewijzigd. Verifieer je nieuwe e-mail.",
  },
  'Enter a new password for <ph id="0" equiv="PH" disp="this.passwordResetEmail"/>':
    {
      de: 'Gib ein neues Passwort für <ph id="0" equiv="PH" disp="this.passwordResetEmail"/> ein',
      es: 'Ingresa una nueva contraseña para <ph id="0" equiv="PH" disp="this.passwordResetEmail"/>',
      fr: 'Entrez un nouveau mot de passe pour <ph id="0" equiv="PH" disp="this.passwordResetEmail"/>',
      it: 'Inserisci una nuova password per <ph id="0" equiv="PH" disp="this.passwordResetEmail"/>',
      nl: 'Voer een nieuw wachtwoord in voor <ph id="0" equiv="PH" disp="this.passwordResetEmail"/>',
    },
  "Error changing email. Please check your password.": {
    de: "Fehler beim Ändern der E-Mail. Bitte überprüfe dein Passwort.",
    es: "Error al cambiar el correo. Por favor verifica tu contraseña.",
    fr: "Erreur lors du changement d'e-mail. Veuillez vérifier votre mot de passe.",
    it: "Errore durante il cambio email. Controlla la tua password.",
    nl: "Fout bij het wijzigen van e-mail. Controleer je wachtwoord.",
  },
  "Error changing password. Please try again.": {
    de: "Fehler beim Ändern des Passworts. Bitte versuche es erneut.",
    es: "Error al cambiar la contraseña. Por favor intenta de nuevo.",
    fr: "Erreur lors du changement de mot de passe. Veuillez réessayer.",
    it: "Errore durante il cambio password. Riprova.",
    nl: "Fout bij het wijzigen van wachtwoord. Probeer het opnieuw.",
  },
  "Error deleting account. Please try again.": {
    de: "Fehler beim Löschen des Kontos. Bitte versuche es erneut.",
    es: "Error al eliminar la cuenta. Por favor intenta de nuevo.",
    fr: "Erreur lors de la suppression du compte. Veuillez réessayer.",
    it: "Errore durante l'eliminazione dell'account. Riprova.",
    nl: "Fout bij het verwijderen van account. Probeer het opnieuw.",
  },
  "Error sending reset email. Please try again.": {
    de: "Fehler beim Senden der Zurücksetzungs-E-Mail. Bitte versuche es erneut.",
    es: "Error al enviar el correo de restablecimiento. Por favor intenta de nuevo.",
    fr: "Erreur lors de l'envoi de l'e-mail de réinitialisation. Veuillez réessayer.",
    it: "Errore durante l'invio dell'email di ripristino. Riprova.",
    nl: "Fout bij het verzenden van reset-e-mail. Probeer het opnieuw.",
  },
  Explorer: {
    de: "Entdecker",
    es: "Explorador",
    fr: "Explorateur",
    it: "Esploratore",
    nl: "Verkenner",
  },
  Filters: {
    de: "Filter",
    es: "Filtros",
    fr: "Filtres",
    it: "Filtri",
    nl: "Filters",
  },
  Following: {
    de: "Folge ich",
    es: "Siguiendo",
    fr: "Abonné",
    it: "Seguiti",
    nl: "Volgend",
  },
  Founder: {
    de: "Gründer",
    es: "Fundador",
    fr: "Fondateur",
    it: "Fondatore",
    nl: "Oprichter",
  },
  "Freerunner since": {
    de: "Freerunner seit",
    es: "Freerunner desde",
    fr: "Freerunner depuis",
    it: "Freerunner dal",
    nl: "Freerunner sinds",
  },
  Garage: {
    de: "Garage",
    es: "Garaje",
    fr: "Garage",
    it: "Garage",
    nl: "Garage",
  },
  General: {
    de: "Allgemein",
    es: "General",
    fr: "Général",
    it: "Generale",
    nl: "Algemeen",
  },
  "Get in Touch": {
    de: "Kontakt aufnehmen",
    es: "Ponte en contacto",
    fr: "Contactez-nous",
    it: "Mettiti in contatto",
    nl: "Neem contact op",
  },
  "Go Home": {
    de: "Nach Hause gehen",
    es: "Ir a Inicio",
    fr: "Aller à l'accueil",
    it: "Vai alla Home",
    nl: "Ga naar Home",
  },
  "Go to Profile": {
    de: "Zum Profil",
    es: "Ir al perfil",
    fr: "Aller au profil",
    it: "Vai al profilo",
    nl: "Ga naar profiel",
  },
  "Home City": {
    de: "Heimatstadt",
    es: "Ciudad natal",
    fr: "Ville d'origine",
    it: "Città natale",
    nl: "Woonplaats",
  },
  "Home Spots": {
    de: "Heimat-Spots",
    es: "Spots locales",
    fr: "Spots locaux",
    it: "Spot locali",
    nl: "Lokale spots",
  },
  In: { de: "In", es: "En", fr: "Dans", it: "A", nl: "In" },
  "Incorrect password. Please try again.": {
    de: "Falsches Passwort. Bitte versuche es erneut.",
    es: "Contraseña incorrecta. Por favor intenta de nuevo.",
    fr: "Mot de passe incorrect. Veuillez réessayer.",
    it: "Password non corretta. Riprova.",
    nl: "Onjuist wachtwoord. Probeer het opnieuw.",
  },
  Indoor: {
    de: "Indoor",
    es: "Interior",
    fr: "Intérieur",
    it: "Interno",
    nl: "Binnen",
  },
  "Indoor / Outdoor": {
    de: "Indoor / Outdoor",
    es: "Interior / Exterior",
    fr: "Intérieur / Extérieur",
    it: "Interno / Esterno",
    nl: "Binnen / Buiten",
  },
  "Instagram DMs": {
    de: "Instagram DMs",
    es: "DMs de Instagram",
    fr: "DMs Instagram",
    it: "DM di Instagram",
    nl: "Instagram DM's",
  },
  "Invalid Link": {
    de: "Ungültiger Link",
    es: "Enlace inválido",
    fr: "Lien invalide",
    it: "Link non valido",
    nl: "Ongeldige link",
  },
  "Invalid email address": {
    de: "Ungültige E-Mail-Adresse",
    es: "Dirección de correo inválida",
    fr: "Adresse e-mail invalide",
    it: "Indirizzo email non valido",
    nl: "Ongeldig e-mailadres",
  },
  "Invalid email address.": {
    de: "Ungültige E-Mail-Adresse.",
    es: "Dirección de correo inválida.",
    fr: "Adresse e-mail invalide.",
    it: "Indirizzo email non valido.",
    nl: "Ongeldig e-mailadres.",
  },
  "Invalid email or password.": {
    de: "Ungültige E-Mail oder Passwort.",
    es: "Correo o contraseña inválidos.",
    fr: "E-mail ou mot de passe invalide.",
    it: "Email o password non validi.",
    nl: "Ongeldig e-mailadres of wachtwoord.",
  },
  "Is there drinking water available right at the spot?": {
    de: "Gibt es Trinkwasser direkt am Spot?",
    es: "¿Hay agua potable disponible justo en el spot?",
    fr: "Y a-t-il de l'eau potable disponible directement sur le spot ?",
    it: "C'è acqua potabile disponibile proprio allo spot?",
    nl: "Is er drinkwater beschikbaar direct bij de spot?",
  },
  "Join Discord": {
    de: "Discord beitreten",
    es: "Unirse a Discord",
    fr: "Rejoindre Discord",
    it: "Unisciti a Discord",
    nl: "Word lid van Discord",
  },
  Label: {
    de: "Label",
    es: "Etiqueta",
    fr: "Étiquette",
    it: "Etichetta",
    nl: "Label",
  },
  Leaderboard: {
    de: "Bestenliste",
    es: "Tabla de clasificación",
    fr: "Classement",
    it: "Classifica",
    nl: "Klassement",
  },
  Lighting: {
    de: "Beleuchtung",
    es: "Iluminación",
    fr: "Éclairage",
    it: "Illuminazione",
    nl: "Verlichting",
  },
  'Manage your <ph id="0" equiv="PH" disp="point.name"/> settings.': {
    de: 'Verwalte deine <ph id="0" equiv="PH" disp="point.name"/> Einstellungen.',
    es: 'Administra tu configuración de <ph id="0" equiv="PH" disp="point.name"/>.',
    fr: 'Gérez vos paramètres <ph id="0" equiv="PH" disp="point.name"/>.',
    it: 'Gestisci le impostazioni di <ph id="0" equiv="PH" disp="point.name"/>.',
    nl: 'Beheer je <ph id="0" equiv="PH" disp="point.name"/> instellingen.',
  },
  "Manage your profile and account settings.": {
    de: "Verwalte deine Profil- und Kontoeinstellungen.",
    es: "Administra la configuración de tu perfil y cuenta.",
    fr: "Gérez les paramètres de votre profil et compte.",
    it: "Gestisci le impostazioni del tuo profilo e account.",
    nl: "Beheer je profiel- en accountinstellingen.",
  },
  Media: { de: "Medien", es: "Medios", fr: "Média", it: "Media", nl: "Media" },
  "Media Added": {
    de: "Medien hinzugefügt",
    es: "Medios añadidos",
    fr: "Média ajouté",
    it: "Media aggiunti",
    nl: "Media toegevoegd",
  },
  "Minimum 6 characters": {
    de: "Mindestens 6 Zeichen",
    es: "Mínimo 6 caracteres",
    fr: "Minimum 6 caractères",
    it: "Minimo 6 caratteri",
    nl: "Minimaal 6 tekens",
  },
  Monument: {
    de: "Denkmal",
    es: "Monumento",
    fr: "Monument",
    it: "Monumento",
    nl: "Monument",
  },
  Nationality: {
    de: "Nationalität",
    es: "Nacionalidad",
    fr: "Nationalité",
    it: "Nazionalità",
    nl: "Nationaliteit",
  },
  "New E-mail address": {
    de: "Neue E-Mail-Adresse",
    es: "Nueva dirección de correo",
    fr: "Nouvelle adresse e-mail",
    it: "Nuovo indirizzo email",
    nl: "Nieuw e-mailadres",
  },
  "New Password": {
    de: "Neues Passwort",
    es: "Nueva contraseña",
    fr: "Nouveau mot de passe",
    it: "Nuova password",
    nl: "Nieuw wachtwoord",
  },
  "New password": {
    de: "Neues Passwort",
    es: "Nueva contraseña",
    fr: "Nouveau mot de passe",
    it: "Nuova password",
    nl: "Nieuw wachtwoord",
  },
  "New password is too weak.": {
    de: "Das neue Passwort ist zu schwach.",
    es: "La nueva contraseña es demasiado débil.",
    fr: "Le nouveau mot de passe est trop faible.",
    it: "La nuova password è troppo debole.",
    nl: "Het nieuwe wachtwoord is te zwak.",
  },
  "New passwords do not match": {
    de: "Die neuen Passwörter stimmen nicht überein",
    es: "Las nuevas contraseñas no coinciden",
    fr: "Les nouveaux mots de passe ne correspondent pas",
    it: "Le nuove password non corrispondono",
    nl: "De nieuwe wachtwoorden komen niet overeen",
  },
  "No account found for this email address.": {
    de: "Kein Konto für diese E-Mail-Adresse gefunden.",
    es: "No se encontró cuenta para esta dirección de correo.",
    fr: "Aucun compte trouvé pour cette adresse e-mail.",
    it: "Nessun account trovato per questo indirizzo email.",
    nl: "Geen account gevonden voor dit e-mailadres.",
  },
  "Not verified": {
    de: "Nicht verifiziert",
    es: "No verificado",
    fr: "Non vérifié",
    it: "Non verificato",
    nl: "Niet geverifieerd",
  },
  "Open Gym (ASVZ)": {
    de: "Open Gym (ASVZ)",
    es: "Gimnasio Abierto (ASVZ)",
    fr: "Gymnase Ouvert (ASVZ)",
    it: "Palestra Aperta (ASVZ)",
    nl: "Open Gym (ASVZ)",
  },
  Outdoor: {
    de: "Outdoor",
    es: "Exterior",
    fr: "Extérieur",
    it: "Esterno",
    nl: "Buiten",
  },
  "Page not found": {
    de: "Seite nicht gefunden",
    es: "Página no encontrada",
    fr: "Page non trouvée",
    it: "Pagina non trovata",
    nl: "Pagina niet gevonden",
  },
  Park: { de: "Park", es: "Parque", fr: "Parc", it: "Parco", nl: "Park" },
  Parking: {
    de: "Parkplatz",
    es: "Estacionamiento",
    fr: "Parking",
    it: "Parcheggio",
    nl: "Parkeerplaats",
  },
  "Parkour Gym": {
    de: "Parkour-Halle",
    es: "Gimnasio de Parkour",
    fr: "Salle de Parkour",
    it: "Palestra di Parkour",
    nl: "Parkour Gym",
  },
  "Parkour Park": {
    de: "Parkour-Park",
    es: "Parque de Parkour",
    fr: "Parc de Parkour",
    it: "Parco di Parkour",
    nl: "Parkour Park",
  },
  "Parkour spot in ": {
    de: "Parkour-Spot in ",
    es: "Spot de Parkour en ",
    fr: "Spot de Parkour à ",
    it: "Spot di Parkour a ",
    nl: "Parkour spot in ",
  },
  "Password Reset Failed": {
    de: "Passwortzurücksetzung fehlgeschlagen",
    es: "Restablecimiento de contraseña fallido",
    fr: "Échec de la réinitialisation du mot de passe",
    it: "Reimpostazione password fallita",
    nl: "Wachtwoord reset mislukt",
  },
  "Password Reset Successful": {
    de: "Passwort erfolgreich zurückgesetzt",
    es: "Restablecimiento de contraseña exitoso",
    fr: "Réinitialisation du mot de passe réussie",
    it: "Reimpostazione password riuscita",
    nl: "Wachtwoord succesvol gereset",
  },
  "Password changed successfully": {
    de: "Passwort erfolgreich geändert",
    es: "Contraseña cambiada exitosamente",
    fr: "Mot de passe modifié avec succès",
    it: "Password cambiata con successo",
    nl: "Wachtwoord succesvol gewijzigd",
  },
  "Password is required": {
    de: "Passwort ist erforderlich",
    es: "Se requiere contraseña",
    fr: "Le mot de passe est requis",
    it: "La password è richiesta",
    nl: "Wachtwoord is vereist",
  },
  "Password must be at least 6 characters": {
    de: "Passwort muss mindestens 6 Zeichen lang sein",
    es: "La contraseña debe tener al menos 6 caracteres",
    fr: "Le mot de passe doit contenir au moins 6 caractères",
    it: "La password deve essere di almeno 6 caratteri",
    nl: "Wachtwoord moet minimaal 6 tekens bevatten",
  },
  "Passwords do not match": {
    de: "Passwörter stimmen nicht überein",
    es: "Las contraseñas no coinciden",
    fr: "Les mots de passe ne correspondent pas",
    it: "Le password non corrispondono",
    nl: "Wachtwoorden komen niet overeen",
  },
  Pathfinder: {
    de: "Wegbereiter",
    es: "Pionero",
    fr: "Éclaireur",
    it: "Esploratore",
    nl: "Padvinder",
  },
  "Permanently delete": {
    de: "Dauerhaft löschen",
    es: "Eliminar permanentemente",
    fr: "Supprimer définitivement",
    it: "Elimina definitivamente",
    nl: "Permanent verwijderen",
  },
  Pioneer: {
    de: "Pionier",
    es: "Pionero",
    fr: "Pionnier",
    it: "Pioniere",
    nl: "Pionier",
  },
  "Please enter your email address": {
    de: "Bitte gib deine E-Mail-Adresse ein",
    es: "Por favor ingresa tu dirección de correo",
    fr: "Veuillez entrer votre adresse e-mail",
    it: "Inserisci il tuo indirizzo email",
    nl: "Voer je e-mailadres in",
  },
  "Please enter your password": {
    de: "Bitte gib dein Passwort ein",
    es: "Por favor ingresa tu contraseña",
    fr: "Veuillez entrer votre mot de passe",
    it: "Inserisci la tua password",
    nl: "Voer je wachtwoord in",
  },
  "Please fill in all fields": {
    de: "Bitte fülle alle Felder aus",
    es: "Por favor completa todos los campos",
    fr: "Veuillez remplir tous les champs",
    it: "Compila tutti i campi",
    nl: "Vul alle velden in",
  },
  "Please wait while we recover your email address...": {
    de: "Bitte warte, während wir deine E-Mail-Adresse wiederherstellen...",
    es: "Por favor espera mientras recuperamos tu dirección de correo...",
    fr: "Veuillez patienter pendant que nous récupérons votre adresse e-mail...",
    it: "Attendi mentre recuperiamo il tuo indirizzo email...",
    nl: "Even geduld terwijl we je e-mailadres herstellen...",
  },
  "Please wait while we verify your email address...": {
    de: "Bitte warte, während wir deine E-Mail-Adresse verifizieren...",
    es: "Por favor espera mientras verificamos tu dirección de correo...",
    fr: "Veuillez patienter pendant que nous vérifions votre adresse e-mail...",
    it: "Attendi mentre verifichiamo il tuo indirizzo email...",
    nl: "Even geduld terwijl we je e-mailadres verifiëren...",
  },
  Policy: {
    de: "Richtlinie",
    es: "Política",
    fr: "Politique",
    it: "Politica",
    nl: "Beleid",
  },
  "Privacy Policy": {
    de: "Datenschutzerklärung",
    es: "Política de Privacidad",
    fr: "Politique de confidentialité",
    it: "Informativa sulla privacy",
    nl: "Privacybeleid",
  },
  Public: {
    de: "Öffentlich",
    es: "Público",
    fr: "Public",
    it: "Pubblico",
    nl: "Openbaar",
  },
  "Public profile": {
    de: "Öffentliches Profil",
    es: "Perfil público",
    fr: "Profil public",
    it: "Profilo pubblico",
    nl: "Openbaar profiel",
  },
  "Quick Links": {
    de: "Schnelllinks",
    es: "Enlaces rápidos",
    fr: "Liens rapides",
    it: "Link rapidi",
    nl: "Snelkoppelingen",
  },
  "Re-authentication failed. Account not deleted.": {
    de: "Erneute Authentifizierung fehlgeschlagen. Konto nicht gelöscht.",
    es: "Falló la reautenticación. Cuenta no eliminada.",
    fr: "Échec de la ré-authentification. Compte non supprimé.",
    it: "Riautenticazione fallita. Account non eliminato.",
    nl: "Herauthenticatie mislukt. Account niet verwijderd.",
  },
  "Recovering Email": {
    de: "E-Mail wird wiederhergestellt",
    es: "Recuperando correo",
    fr: "Récupération de l'e-mail",
    it: "Recupero email",
    nl: "E-mail herstellen",
  },
  "Recovery Failed": {
    de: "Wiederherstellung fehlgeschlagen",
    es: "Falló la recuperación",
    fr: "Échec de la récupération",
    it: "Recupero fallito",
    nl: "Herstel mislukt",
  },
  "Request new link": {
    de: "Neuen Link anfordern",
    es: "Solicitar nuevo enlace",
    fr: "Demander un nouveau lien",
    it: "Richiedi nuovo link",
    nl: "Nieuwe link aanvragen",
  },
  "Reset Password": {
    de: "Passwort zurücksetzen",
    es: "Restablecer contraseña",
    fr: "Réinitialiser le mot de passe",
    it: "Reimposta password",
    nl: "Wachtwoord resetten",
  },
  "Reset password": {
    de: "Passwort zurücksetzen",
    es: "Restablecer contraseña",
    fr: "Réinitialiser le mot de passe",
    it: "Reimposta password",
    nl: "Wachtwoord resetten",
  },
  "Return to sign in": {
    de: "Zurück zur Anmeldung",
    es: "Volver a Iniciar sesión",
    fr: "Retour à la connexion",
    it: "Torna all'accesso",
    nl: "Terug naar inloggen",
  },
  School: {
    de: "Schule",
    es: "Escuela",
    fr: "École",
    it: "Scuola",
    nl: "School",
  },
  "Security check failed. Please sign in again and try deleting your account.":
    {
      de: "Sicherheitsüberprüfung fehlgeschlagen. Bitte melde dich erneut an und versuche, dein Konto zu löschen.",
      es: "Falló la verificación de seguridad. Por favor inicia sesión nuevamente e intenta eliminar tu cuenta.",
      fr: "Échec du contrôle de sécurité. Veuillez vous reconnecter et réessayer de supprimer votre compte.",
      it: "Controllo di sicurezza fallito. Accedi nuovamente e prova a eliminare il tuo account.",
      nl: "Beveiligingscontrole mislukt. Log opnieuw in en probeer je account te verwijderen.",
    },
  "Sending...": {
    de: "Senden...",
    es: "Enviando...",
    fr: "Envoi...",
    it: "Invio...",
    nl: "Verzenden...",
  },
  Settings: {
    de: "Einstellungen",
    es: "Ajustes",
    fr: "Paramètres",
    it: "Impostazioni",
    nl: "Instellingen",
  },
  "Settings - ": {
    de: "Einstellungen - ",
    es: "Ajustes - ",
    fr: "Paramètres - ",
    it: "Impostazioni - ",
    nl: "Instellingen - ",
  },
  "Sign in now": {
    de: "Jetzt anmelden",
    es: "Inicia sesión ahora",
    fr: "Connectez-vous maintenant",
    it: "Accedi ora",
    nl: "Log nu in",
  },
  "Skate Park": {
    de: "Skatepark",
    es: "Skatepark",
    fr: "Skatepark",
    it: "Skatepark",
    nl: "Skatepark",
  },
  "Smart Scorecard": {
    de: "Smart Scorecard",
    es: "Tarjeta de Puntuación Inteligente",
    fr: "Carte de Score Intelligente",
    it: "Scheda di Punteggio Intelligente",
    nl: "Slimme Scorekaart",
  },
  Solo: { de: "Solo", es: "Solo", fr: "Solo", it: "Solo", nl: "Solo" },
  Spots: { de: "Spots", es: "Spots", fr: "Spots", it: "Spot", nl: "Spots" },
  "Spots Created": {
    de: "Erstellte Spots",
    es: "Spots creados",
    fr: "Spots créés",
    it: "Spot creati",
    nl: "Gemaakte spots",
  },
  Support: {
    de: "Support",
    es: "Soporte",
    fr: "Support",
    it: "Supporto",
    nl: "Ondersteuning",
  },
  Supporter: {
    de: "Unterstützer",
    es: "Partidario",
    fr: "Supporter",
    it: "Sostenitore",
    nl: "Supporter",
  },
  Team: { de: "Team", es: "Equipo", fr: "Équipe", it: "Team", nl: "Team" },
  "The password is too weak. Please use at least 6 characters.": {
    de: "Das Passwort ist zu schwach. Bitte verwende mindestens 6 Zeichen.",
    es: "La contraseña es demasiado débil. Por favor usa al menos 6 caracteres.",
    fr: "Le mot de passe est trop faible. Veuillez utiliser au moins 6 caractères.",
    it: "La password è troppo debole. Usa almeno 6 caratteri.",
    nl: "Het wachtwoord is te zwak. Gebruik minimaal 6 tekens.",
  },
  "The reset E-mail has been sent!": {
    de: "Die Zurücksetzungs-E-Mail wurde gesendet!",
    es: "¡El correo de restablecimiento ha sido enviado!",
    fr: "L'e-mail de réinitialisation a été envoyé !",
    it: "L'email di ripristino è stata inviata!",
    nl: "De reset-e-mail is verzonden!",
  },
  "This E-Mail address is not valid!": {
    de: "Diese E-Mail-Adresse ist ungültig!",
    es: "¡Esta dirección de correo no es válida!",
    fr: "Cette adresse e-mail n'est pas valide !",
    it: "Questo indirizzo email non è valido!",
    nl: "Dit e-mailadres is ongeldig!",
  },
  "This account has been disabled. Please contact support.": {
    de: "Dieses Konto wurde deaktiviert. Bitte kontaktiere den Support.",
    es: "Esta cuenta ha sido deshabilitada. Por favor contacta soporte.",
    fr: "Ce compte a été désactivé. Veuillez contacter le support.",
    it: "Questo account è stato disabilitato. Contatta il supporto.",
    nl: "Dit account is uitgeschakeld. Neem contact op met support.",
  },
  "This email is already in use.": {
    de: "Diese E-Mail wird bereits verwendet.",
    es: "Este correo ya está en uso.",
    fr: "Cet e-mail est déjà utilisé.",
    it: "Questa email è già in uso.",
    nl: "Dit e-mailadres is al in gebruik.",
  },
  "This link has expired. Please request a new one.": {
    de: "Dieser Link ist abgelaufen. Bitte fordere einen neuen an.",
    es: "Este enlace ha caducado. Por favor solicita uno nuevo.",
    fr: "Ce lien a expiré. Veuillez en demander un nouveau.",
    it: "Questo link è scaduto. Richiedine uno nuovo.",
    nl: "Deze link is verlopen. Vraag een nieuwe aan.",
  },
  "This link is invalid or has already been used. Please request a new one.": {
    de: "Dieser Link ist ungültig oder wurde bereits verwendet. Bitte fordere einen neuen an.",
    es: "Este enlace es inválido o ya ha sido usado. Por favor solicita uno nuevo.",
    fr: "Ce lien est invalide ou a déjà été utilisé. Veuillez en demander un nouveau.",
    it: "Questo link non è valido o è già stato utilizzato. Richiedine uno nuovo.",
    nl: "Deze link is ongeldig of al gebruikt. Vraag een nieuwe aan.",
  },
  "This link is invalid or has expired. Please request a new one.": {
    de: "Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
    es: "Este enlace es inválido o ha caducado. Por favor solicita uno nuevo.",
    fr: "Ce lien est invalide ou a expiré. Veuillez en demander un nouveau.",
    it: "Questo link non è valido o è scaduto. Richiedine uno nuovo.",
    nl: "Deze link is ongeldig of verlopen. Vraag een nieuwe aan.",
  },
  "This link is not recognized. Please check your email and try again.": {
    de: "Dieser Link wird nicht erkannt. Bitte überprüfe deine E-Mail und versuche es erneut.",
    es: "Este enlace no se reconoce. Por favor verifica tu correo e intenta de nuevo.",
    fr: "Ce lien n'est pas reconnu. Veuillez vérifier votre e-mail et réessayer.",
    it: "Questo link non è riconosciuto. Controlla la tua email e riprova.",
    nl: "Deze link wordt niet herkend. Controleer je e-mail en probeer het opnieuw.",
  },
  Trailblazer: {
    de: "Wegbereiter",
    es: "Pionero",
    fr: "Pionnier",
    it: "Pioniere",
    nl: "Baanbreker",
  },
  "Unable to process this request. Please try again later.": {
    de: "Anfrage konnte nicht verarbeitet werden. Bitte versuche es später noch einmal.",
    es: "No se puede procesar esta solicitud. Por favor intenta de nuevo más tarde.",
    fr: "Impossible de traiter cette demande. Veuillez réessayer plus tard.",
    it: "Impossibile elaborare questa richiesta. Riprova più tardi.",
    nl: "Kan dit verzoek niet verwerken. Probeer het later opnieuw.",
  },
  "Unknown Action": {
    de: "Unbekannte Aktion",
    es: "Acción desconocida",
    fr: "Action inconnue",
    it: "Azione sconosciuta",
    nl: "Onbekende actie",
  },
  "Validating your reset link...": {
    de: "Dein Zurücksetzungs-Link wird validiert...",
    es: "Validando tu enlace de restablecimiento...",
    fr: "Validation de votre lien de réinitialisation...",
    it: "Convalida del tuo link di ripristino...",
    nl: "Je resetlink valideren...",
  },
  "Verification Failed": {
    de: "Verifizierung fehlgeschlagen",
    es: "Verificación fallida",
    fr: "Échec de la vérification",
    it: "Verifica fallita",
    nl: "Verificatie mislukt",
  },
  Verified: {
    de: "Verifiziert",
    es: "Verificado",
    fr: "Vérifié",
    it: "Verificato",
    nl: "Geverifieerd",
  },
  "Verifying Email": {
    de: "E-Mail wird verifiziert",
    es: "Verificando correo",
    fr: "Vérification de l'e-mail",
    it: "Verifica email",
    nl: "E-mail verifiëren",
  },
  WC: { de: "WC", es: "WC", fr: "WC", it: "WC", nl: "WC" },
  Water: { de: "Wasser", es: "Agua", fr: "Eau", it: "Acqua", nl: "Water" },
  "Your account has been deleted. Goodbye!": {
    de: "Dein Konto wurde gelöscht. Auf Wiedersehen!",
    es: "Tu cuenta ha sido eliminada. ¡Adiós!",
    fr: "Votre compte a été supprimé. Au revoir !",
    it: "Il tuo account è stato eliminato. Arrivederci!",
    nl: "Je account is verwijderd. Tot ziens!",
  },
  "Your email address has been successfully recovered. You may want to change your password if you didn&apos;t make this change.":
    {
      de: "Deine E-Mail-Adresse wurde erfolgreich wiederhergestellt. Du solltest dein Passwort ändern, wenn du diese Änderung nicht vorgenommen hast.",
      es: "Tu dirección de correo ha sido recuperada exitosamente. Es posible que desees cambiar tu contraseña si no realizaste este cambio.",
      fr: "Votre adresse e-mail a été récupérée avec succès. Vous voudrez peut-être changer votre mot de passe si vous n'êtes pas à l'origine de ce changement.",
      it: "Il tuo indirizzo email è stato recuperato con successo. Potresti voler cambiare la tua password se non hai effettuato questa modifica.",
      nl: "Je e-mailadres is succesvol hersteld. Je wilt misschien je wachtwoord wijzigen als je deze wijziging niet hebt aangebracht.",
    },
  "Your email address has been successfully verified. You can now access all features of PK Spot.":
    {
      de: "Deine E-Mail-Adresse wurde erfolgreich verifiziert. Du kannst jetzt auf alle Funktionen von PK Spot zugreifen.",
      es: "Tu dirección de correo ha sido verificada exitosamente. Ahora puedes acceder a todas las funciones de PK Spot.",
      fr: "Votre adresse e-mail a été vérifiée avec succès. Vous pouvez maintenant accéder à toutes les fonctionnalités de PK Spot.",
      it: "Il tuo indirizzo email è stato verificato con successo. Ora puoi accedere a tutte le funzionalità di PK Spot.",
      nl: "Je e-mailadres is succesvol geverifieerd. Je hebt nu toegang tot alle functies van PK Spot.",
    },
  "Your password has been successfully reset. You can now sign in with your new password.":
    {
      de: "Dein Passwort wurde erfolgreich zurückgesetzt. Du kannst dich jetzt mit deinem neuen Passwort anmelden.",
      es: "Tu contraseña ha sido restablecida exitosamente. Ahora puedes iniciar sesión con tu nueva contraseña.",
      fr: "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
      it: "La tua password è stata reimpostata con successo. Ora puoi accedere con la tua nuova password.",
      nl: "Je wachtwoord is succesvol gereset. Je kunt nu inloggen met je nieuwe wachtwoord.",
    },
  from: { de: "von", es: "de", fr: "de", it: "da", nl: "van" },
  "{VAR_PLURAL, plural, =1 {Follower} other {Followers}}": {
    de: "{VAR_PLURAL, plural, =1 {Follower} other {Follower}}",
    es: "{VAR_PLURAL, plural, =1 {Seguidor} other {Seguidores}}",
    fr: "{VAR_PLURAL, plural, =1 {Abonné} other {Abonnés}}",
    it: "{VAR_PLURAL, plural, =1 {Seguace} other {Seguaci}}",
    nl: "{VAR_PLURAL, plural, =1 {Volger} other {Volgers}}",
  },
  "Open in Google Maps": {
    de: "In Google Maps öffnen",
    es: "Abrir en Google Maps",
    fr: "Ouvrir dans Google Maps",
    it: "Apri in Google Maps",
    nl: "Openen in Google Maps",
  },
  "Android Early Access": {
    de: "Android Early Access",
    es: "Acceso Anticipado Android",
    fr: "Accès anticipé Android",
    it: "Accesso anticipato Android",
    nl: "Android Early Access",
  },
  "Become a Tester": {
    de: "Tester werden",
    es: "Convertirse en tester",
    fr: "Devenir testeur",
    it: "Diventa un tester",
    nl: "Tester worden",
  },
  "iOS App Store": {
    de: "iOS App Store",
    es: "App Store de iOS",
    fr: "App Store iOS",
    it: "App Store iOS",
    nl: "iOS App Store",
  },
  GitHub: {
    de: "GitHub",
    es: "GitHub",
    fr: "GitHub",
    it: "GitHub",
    nl: "GitHub",
  },
  Photographer: {
    de: "Fotograf",
    es: "Fotógrafo",
    fr: "Photographe",
    it: "Fotografo",
    nl: "Fotograaf",
  },
  Helper: {
    de: "Helfer",
    es: "Ayudante",
    fr: "Aide",
    it: "Aiutante",
    nl: "Helper",
  },
  Architect: {
    de: "Architekt",
    es: "Arquitecto",
    fr: "Architecte",
    it: "Architetto",
    nl: "Architect",
  },
  Curator: {
    de: "Kurator",
    es: "Curador",
    fr: "Conservateur",
    it: "Curatore",
    nl: "Curator",
  },
  Contributor: {
    de: "Mitwirkender",
    es: "Colaborador",
    fr: "Contributeur",
    it: "Contributore",
    nl: "Bijdrager",
  },
  Editor: {
    de: "Bearbeiter",
    es: "Editor",
    fr: "Éditeur",
    it: "Editore",
    nl: "Editor",
  },
  Snapper: {
    de: "Knipser",
    es: "Fotógrafo",
    fr: "Photographe",
    it: "Fotografo",
    nl: "Snapper",
  },
  Filmmaker: {
    de: "Filmemacher",
    es: "Cineasta",
    fr: "Cinéaste",
    it: "Regista",
    nl: "Filmmaker",
  },
  "Get Support": {
    de: "Unterstützung erhalten",
    es: "Obtener soporte",
    fr: "Obtenir de l'aide",
    it: "Ricevi supporto",
    nl: "Krijg ondersteuning",
  },
  "What is Early Access?": {
    de: "Was ist Early Access?",
    es: "¿Qué es el Acceso Anticipado?",
    fr: "Qu'est-ce que l'accès anticipé ?",
    it: "Cos'è l'accesso anticipato?",
    nl: "Wat is Early Access?",
  },
  Shutterbug: {
    de: "Hobbyfotograf",
    es: "Aficionado a la fotografía",
    fr: "Passionné de photo",
    it: "Appassionato di foto",
    nl: "Hobbyfotograaf",
  },
  Solo: {
    de: "Solo",
    es: "Solo",
    fr: "Solo",
    it: "Solo",
    nl: "Solo",
  },
  Team: {
    de: "Team",
    es: "Equipo",
    fr: "Équipe",
    it: "Team",
    nl: "Team",
  },
  "Terms of Service": {
    de: "Nutzungsbedingungen",
    es: "Términos de servicio",
    fr: "Conditions d'utilisation",
    it: "Termini di servizio",
    nl: "Servicevoorwaarden",
  },
  "Unnamed Drinking Water spot": {
    de: "Unbenannter Trinkwasserspot",
    es: "Punto de agua potable sin nombre",
    fr: "Point d'eau potable sans nom",
    it: "Punto acqua potabile senza nome",
    nl: "Naamloze drinkwaterplek",
  },
  "Unnamed Toilet": {
    de: "Unbenannte Toilette",
    es: "Baño sin nombre",
    fr: "Toilettes sans nom",
    it: "Bagno senza nome",
    nl: "Naamloos toilet",
  },
  "Download PK Spot from the Apple App Store. Get the full native experience with offline support and seamless performance on your iPhone or iPad.":
    {
      de: "Lade PK Spot aus dem Apple App Store herunter. Hol dir das volle native Erlebnis mit Offline-Unterstützung und nahtloser Leistung auf deinem iPhone oder iPad.",
      es: "Descarga PK Spot desde la Apple App Store. Obtén la experiencia nativa completa con soporte offline y rendimiento fluido en tu iPhone o iPad.",
      fr: "Téléchargez PK Spot depuis l'App Store Apple. Profitez de l'expérience native complète avec le support hors ligne et des performances fluides sur votre iPhone ou iPad.",
      it: "Scarica PK Spot dall'Apple App Store. Ottieni l'esperienza nativa completa con supporto offline e prestazioni fluide sul tuo iPhone o iPad.",
      nl: "Download PK Spot uit de Apple App Store. Krijg de volledige native ervaring met offline ondersteuning en naadloze prestaties op je iPhone of iPad.",
    },
  "Be among the first to try PK Spot on Android! Join our early access program to get the app before the official launch and help us make it even better.":
    {
      de: "Sei einer der Ersten, die PK Spot auf Android ausprobieren! Tritt unserem Early-Access-Programm bei, um die App vor dem offiziellen Start zu erhalten und uns zu helfen, sie noch besser zu machen.",
      es: "¡Sé uno de los primeros en probar PK Spot en Android! Únete a nuestro programa de acceso anticipado para obtener la aplicación antes del lanzamiento oficial y ayúdanos a mejorarla.",
      fr: "Soyez parmi les premiers à essayer PK Spot sur Android ! Rejoignez notre programme d'accès anticipé pour obtenir l'application avant le lancement officiel et aidez-nous à l'améliorer.",
      it: "Sii tra i primi a provare PK Spot su Android! Unisciti al nostro programma di accesso anticipato per ottenere l'app prima del lancio ufficiale e aiutaci a migliorarla.",
      nl: "Wees een van de eersten die PK Spot op Android probeert! Word lid van ons Early Access-programma om de app voor de officiële lancering te krijgen en ons te helpen deze nog beter te maken.",
    },
  "Be among the first to experience PK Spot on Android! Join our closed testing program and help shape the future of the app.":
    {
      de: "Sei einer der Ersten, die PK Spot auf Android erleben! Tritt unserem geschlossenen Testprogramm bei und hilf mit, die Zukunft der App zu gestalten.",
      es: "¡Sé uno de los primeros en experimentar PK Spot en Android! Únete a nuestro programa de pruebas cerrado y ayuda a dar forma al futuro de la aplicación.",
      fr: "Soyez parmi les premiers à découvrir PK Spot sur Android ! Rejoignez notre programme de test fermé et aidez à façonner l'avenir de l'application.",
      it: "Sii tra i primi a provare l'esperienza di PK Spot su Android! Unisciti al nostro programma di test chiuso e aiuta a plasmare il futuro dell'app.",
      nl: "Wees een van de eersten die PK Spot op Android ervaart! Doe mee aan ons gesloten testprogramma en help de toekomst van de app vorm te geven.",
    },
  "Follow these three simple steps to get the Android app before anyone else.":
    {
      de: "Folge diesen drei einfachen Schritten, um die Android-App vor allen anderen zu erhalten.",
      es: "Sigue estos tres sencillos pasos para obtener la aplicación de Android antes que nadie.",
      fr: "Suivez ces trois étapes simples pour obtenir l'application Android avant tout le monde.",
      it: "Segui questi tre semplici passaggi per ottenere l'app Android prima di chiunque altro.",
      nl: "Volg deze drie eenvoudige stappen om de Android-app eerder dan wie dan ook te krijgen.",
    },
  "Early access versions may have bugs. Your feedback helps us fix issues before the public launch.":
    {
      de: "Early-Access-Versionen können Fehler enthalten. Dein Feedback hilft uns, Probleme vor dem öffentlichen Start zu beheben.",
      es: "Las versiones de acceso anticipado pueden tener errores. Tus comentarios nos ayudan a solucionar problemas antes del lanzamiento público.",
      fr: "Les versions d'accès anticipé peuvent contenir des bugs. Vos commentaires nous aident à corriger les problèmes avant le lancement public.",
      it: "Le versioni ad accesso anticipato potrebbero contenere bug. Il tuo feedback ci aiuta a risolvere i problemi prima del lancio pubblico.",
      nl: "Versies voor vroegtijdige toegang kunnen bugs bevatten. Jouw feedback helpt ons problemen op te lossen vóór de publieke lancering.",
    },
  "Be the first to try new features and improvements as we develop them.": {
    de: "Sei der Erste, der neue Funktionen und Verbesserungen ausprobiert, während wir sie entwickeln.",
    es: "Sé el primero en probar nuevas funciones y mejoras a medida que las desarrollamos.",
    fr: "Soyez le premier à essayer les nouvelles fonctionnalités et améliorations au fur et à mesure que nous les développons.",
    it: "Sii il primo a provare nuove funzionalità e miglioramenti mentre li sviluppiamo.",
    nl: "Wees de eerste die nieuwe functies en verbeteringen uitprobeert terwijl we ze ontwikkelen.",
  },
  "Your feedback directly influences the direction of the app. Tell us what you love and what needs work.":
    {
      de: "Dein Feedback beeinflusst direkt die Richtung der App. Sag uns, was dir gefällt und was verbessert werden muss.",
      es: "Tus comentarios influyen directamente en la dirección de la aplicación. Cuéntanos qué te encanta y qué necesita trabajo.",
      fr: "Vos commentaires influencent directement la direction de l'application. Dites-nous ce que vous aimez et ce qui doit être amélioré.",
      it: "Il tuo feedback influenza direttamente la direzione dell'app. Dicci cosa ami e cosa deve essere migliorato.",
      nl: "Jouw feedback beïnvloedt direct de richting van de app. Vertel ons wat je leuk vindt en wat verbetering behoeft.",
    },
  "Location permission denied. Please enable it to use this feature.": {
    de: "Standortberechtigung verweigert. Bitte aktiviere sie, um diese Funktion zu nutzen.",
    es: "Permiso de ubicación denegado. Habilítalo para usar esta función.",
    fr: "Autorisation de localisation refusée. Veuillez l'activer pour utiliser cette fonctionnalité.",
    it: "Autorizzazione alla posizione negata. Abilitala per utilizzare questa funzione.",
    nl: "Locatietoestemming geweigerd. Schakel dit in om deze functie te gebruiken.",
  },
  "No Google account found on this device. Please add a Google account in your device settings and try again.":
    {
      de: "Kein Google-Konto auf diesem Gerät gefunden. Bitte füge in den Geräteeinstellungen ein Google-Konto hinzu und versuche es erneut.",
      es: "No se encontró ninguna cuenta de Google en este dispositivo. Agrega una cuenta de Google en la configuración de tu dispositivo e intenta de nuevo.",
      fr: "Aucun compte Google trouvé sur cet appareil. Veuillez ajouter un compte Google dans les paramètres de votre appareil et réessayer.",
      it: "Nessun account Google trovato su questo dispositivo. Aggiungi un account Google nelle impostazioni del dispositivo e riprova.",
      nl: "Geen Google-account gevonden op dit apparaat. Voeg een Google-account toe in je apparaatinstellingen en probeer het opnieuw.",
    },
  "No Apple ID found on this device. Please sign in to your Apple ID in your device settings and try again.":
    {
      de: "Keine Apple ID auf diesem Gerät gefunden. Bitte melde dich in den Geräteeinstellungen mit deiner Apple ID an und versuche es erneut.",
      es: "No se encontró ningún ID de Apple en este dispositivo. Inicia sesión con su ID de Apple en la configuración de su dispositivo e intenta de nuevo.",
      fr: "Aucun identifiant Apple trouvé sur cet appareil. Veuillez vous connecter à votre identifiant Apple dans les paramètres de votre appareil et réessayer.",
      it: "Nessun ID Apple trovato su questo dispositivo. Accedi al tuo ID Apple nelle impostazioni del dispositivo e riprova.",
      nl: "Geen Apple ID gevonden op dit apparaat. Log in met je Apple ID in je apparaatinstellingen en probeer het opnieuw.",
    },
  "General settings": {
    de: "Allgemeine Einstellungen",
    es: "Configuración general",
    fr: "Paramètres généraux",
    it: "Impostazioni generali",
    nl: "Algemene instellingen",
  },
  " General settings to tune your experience on PK Spot. ": {
    de: " Allgemeine Einstellungen, um dein Erlebnis auf PK Spot anzupassen. ",
    es: " Configuración general para ajustar tu experiencia en PK Spot. ",
    fr: " Paramètres généraux pour ajuster votre expérience sur PK Spot. ",
    it: " Impostazioni generali per ottimizzare la tua esperienza su PK Spot. ",
    nl: " Algemene instellingen om je ervaring op PK Spot aan te passen. ",
  },
  "Get on Play Store": {
    de: "Auf Play Store holen",
    es: "Obtener en Play Store",
    fr: "Obtenir sur Play Store",
    it: "Disponibile su Play Store",
    nl: "Downloaden via Play Store",
  },
  "Join Google Group": {
    de: "Google-Gruppe beitreten",
    es: "Unirse al grupo de Google",
    fr: "Rejoindre le groupe Google",
    it: "Unisciti al gruppo Google",
    nl: "Word lid van Google Groep",
  },
  "How to Join": {
    de: "Wie man beitritt",
    es: "Cómo unirse",
    fr: "Comment rejoindre",
    it: "Come partecipare",
    nl: "Hoe deelnemen",
  },
  "Shape the App": {
    de: "Gestalte die App",
    es: "Da forma a la App",
    fr: "Façonnez l'application",
    it: "Plasma l'app",
    nl: "Geef de app vorm",
  },
  "Get Features First": {
    de: "Erhalte Funktionen zuerst",
    es: "Obtén funciones primero",
    fr: "Obtenez les fonctionnalités en avant-première",
    it: "Ottieni le funzionalità prima",
    nl: "Krijg functies als eerste",
  },
  "Have questions or running into issues?": {
    de: "Hast du Fragen oder Probleme?",
    es: "¿Tienes preguntas o problemas?",
    fr: "Des questions ou des problèmes ?",
    it: "Hai domande o riscontri problemi?",
    nl: "Heb je vragen of kom je problemen tegen?",
  },
  "Help Find Bugs": {
    de: "Hilf Fehler zu finden",
    es: "Ayuda a encontrar errores",
    fr: "Aidez à trouver des bugs",
    it: "Aiuta a trovare bug",
    nl: "Help bugs te vinden",
  },
  Documenter: {
    de: "Dokumentar",
    es: "Documentalista",
    fr: "Documentaliste",
    it: "Documentalista",
    nl: "Documenteerder",
  },
  No: {
    de: "Nein",
    es: "No",
    fr: "Non",
    it: "No",
    nl: "Nee",
  },
  Notifications: {
    de: "Benachrichtigungen",
    es: "Notificaciones",
    fr: "Notifications",
    it: "Notifiche",
    nl: "Meldingen",
  },
  "First, you need to join our Google Group. This is required by Google Play to participate in closed testing programs. Press the big button at the top to join the group.":
    {
      de: "Zuerst musst du unserer Google-Gruppe beitreten. Dies ist von Google Play erforderlich, um an geschlossenen Testprogrammen teilzunehmen. Drücke den großen Knopf oben, um der Gruppe beizutreten.",
      es: "Primero, debes unirte a nuestro grupo de Google. Esto es requerido por Google Play para participar en programas de pruebas cerrados. Presiona el botón grande en la parte superior para unirte al grupo.",
      fr: "D'abord, vous devez rejoindre notre groupe Google. C'est requis par Google Play pour participer aux programmes de test fermés. Appuyez sur le grand bouton en haut pour rejoindre le groupe.",
      it: "Per prima cosa, devi unirti al nostro gruppo Google. Questo è richiesto da Google Play per partecipare ai programmi di test chiusi. Premi il pulsante grande in alto per unirti al gruppo.",
      nl: "Eerst moet je lid worden van onze Google Groep. Dit is vereist door Google Play om deel te nemen aan gesloten testprogramma's. Druk op de grote knop bovenaan om lid te worden van de groep.",
    },
  '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Download the App ':
    {
      de: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> App herunterladen ',
      es: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Descargar la App ',
      fr: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Télécharger l\'application ',
      it: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Scarica l\'App ',
      nl: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">download</pc> Download de app ',
    },
  '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> days remaining in early access':
    {
      de: '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> Tage verbleibend im Early Access',
      es: '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> días restantes en acceso anticipado',
      fr: '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> jours restants en accès anticipé',
      it: '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> giorni rimanenti in accesso anticipato',
      nl: '<ph id="0" equiv="INTERPOLATION" disp="{{ daysRemaining }}"/> dagen over in early access',
    },
  "← Back to About": {
    de: "← Zurück zu Über uns",
    es: "← Volver a Acerca de",
    fr: "← Retour à À propos",
    it: "← Torna a Informazioni",
    nl: "← Terug naar Over",
  },
  '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Bad quality: This picture is blurry, too dark, or generally poor quality.</pc>':
    {
      de: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Schlechte Qualität: Dieses Bild ist unscharf, zu dunkel oder hat allgemein eine schlechte Qualität.</pc>',
      es: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Mala calidad: Esta imagen es borrosa, demasiado oscura o de mala calidad en general.</pc>',
      fr: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Mauvaise qualité : Cette image est floue, trop sombre ou de mauvaise qualité générale.</pc>',
      it: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Scarsa qualità: Questa immagine è sfocata, troppo scura o di scarsa qualità generale.</pc>',
      nl: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Slechte kwaliteit: Deze afbeelding is wazig, te donker of over het algemeen van slechte kwaliteit.</pc>',
    },
  '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Join Early Access ':
    {
      de: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Early Access beitreten ',
      es: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Unirse al Acceso Anticipado ',
      fr: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Rejoindre l\'accès anticipé ',
      it: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Unisciti all\'Accesso Anticipato ',
      nl: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Word lid van Early Access ',
    },
  " After joining the group, visit the Play Store testing page and opt in to become a tester. This unlocks access to the early access version. ":
    {
      de: " Nachdem du der Gruppe beigetreten bist, besuche die Play Store-Testseite und melde dich als Tester an. Dies schaltet den Zugang zur Early-Access-Version frei. ",
      es: " Después de unirte al grupo, visita la página de prueba de Play Store y solicita participar como probador. Esto desbloquea el acceso a la versión de acceso anticipado. ",
      fr: " Après avoir rejoint le groupe, visitez la page de test du Play Store et inscrivez-vous comme testeur. Cela débloque l'accès à la version d'accès anticipé. ",
      it: " Dopo esserti unito al gruppo, visita la pagina di test del Play Store e iscriviti come tester. Questo sblocca l'accesso alla versione ad accesso anticipato. ",
      nl: " Nadat je lid bent geworden van de groep, bezoek je de testpagina van de Play Store en meld je je aan als tester. Dit ontgrendelt toegang tot de early access-versie. ",
    },
  '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Duplicate: This image is already present on this spot.</pc>':
    {
      de: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Duplikat: Dieses Bild ist bereits bei diesem Spot vorhanden.</pc>',
      es: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Duplicado: Esta imagen ya está presente en este spot.</pc>',
      fr: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Doublon : Cette image est déjà présente sur ce spot.</pc>',
      it: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Duplicato: Questa immagine è già presente in questo spot.</pc>',
      nl: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Duplicaat: Deze afbeelding is al aanwezig bij deze spot.</pc>',
    },
  '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Website ':
    {
      de: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Webseite ',
      es: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Sitio web ',
      fr: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Site web ',
      it: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Sito web ',
      nl: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">language</pc> Website ',
    },
  '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Download on App Store ':
    {
      de: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Im App Store laden ',
      es: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Descargar en App Store ',
      fr: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Télécharger sur l\'App Store ',
      it: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Scarica su App Store ',
      nl: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/apple_icon_dark.png&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;"/> Downloaden in de App Store ',
    },
  '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Join the Google Group ':
    {
      de: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Der Google-Gruppe beitreten ',
      es: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Unirse al grupo de Google ',
      fr: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Rejoindre le groupe Google ',
      it: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Unisciti al gruppo Google ',
      nl: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">group_add</pc> Word lid van de Google Groep ',
    },
  '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Become a Tester ':
    {
      de: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Tester werden ',
      es: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Convertirse en tester ',
      fr: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Devenir testeur ',
      it: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Diventa un tester ',
      nl: '<pc id="0" equivStart="START_TAG_MAT_ICON" equivEnd="CLOSE_TAG_MAT_ICON" type="other" dispStart="&lt;mat-icon&gt;" dispEnd="&lt;/mat-icon&gt;">verified_user</pc> Tester worden ',
    },
  '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Not a picture of this spot: This image does not show the location or is misleading.</pc>':
    {
      de: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Kein Bild dieses Spots: Dieses Bild zeigt nicht den Ort oder ist irreführend.</pc>',
      es: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">No es una foto de este lugar: Esta imagen no muestra la ubicación o es engañosa.</pc>',
      fr: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Pas une photo de ce lieu : Cette image ne montre pas l\'emplacement ou est trompeuse.</pc>',
      it: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Non è una foto di questo posto: Questa immagine non mostra la posizione o è fuorviante.</pc>',
      nl: '<pc id="0" equivStart="START_TAG_SPAN" equivEnd="CLOSE_TAG_SPAN" type="other" dispStart="&lt;span class=&quot;mat-body-large&quot; &gt;" dispEnd="&lt;/span &gt;">Geen foto van deze plek: Deze afbeelding toont de locatie niet of is misleidend.</pc>',
    },
  " Once you&apos;re a tester, you can download PK Spot from the Google Play Store. The app will update automatically as we release new versions. ":
    {
      de: " Sobald du ein Tester bist, kannst du PK Spot aus dem Google Play Store herunterladen. Die App wird automatisch aktualisiert, wenn wir neue Versionen veröffentlichen. ",
      es: " Una vez que seas probador, puedes descargar PK Spot de Google Play Store. La aplicación se actualizará automáticamente a medida que lancemos nuevas versiones. ",
      fr: " Une fois testeur, vous pouvez télécharger PK Spot sur le Google Play Store. L'application se mettra à jour automatiquement dès que nous publierons de nouvelles versions. ",
      it: " Una volta che sei un tester, puoi scaricare PK Spot dal Google Play Store. L'app si aggiornerà automaticamente man mano che rilasceremo nuove versioni. ",
      nl: " Zodra je tester bent, kun je PK Spot downloaden uit de Google Play Store. De app wordt automatisch bijgewerkt zodra we nieuwe versies uitbrengen. ",
    },
  Activity: {
    de: "Aktivität",
    es: "Actividad",
    fr: "Activité",
    it: "Attività",
    nl: "Activiteit",
  },
  Editor: {
    de: "Bearbeiter",
    es: "Editor",
    fr: "Éditeur",
    it: "Editore",
    nl: "Editor",
  },
  " Download PK Spot from the Google Play Store. Get the seamless experience on your Android device. ":
    {
      de: " Lade PK Spot aus dem Google Play Store herunter. Erhalte das nahtlose Erlebnis auf deinem Android-Gerät. ",
      es: " Descarga PK Spot desde Google Play Store. Obtén la experiencia perfecta en tu dispositivo Android. ",
      fr: " Téléchargez PK Spot sur le Google Play Store. Profitez d'une expérience fluide sur votre appareil Android. ",
      it: " Scarica PK Spot dal Google Play Store. Ottieni un'esperienza senza interruzioni sul tuo dispositivo Android. ",
      nl: " Download PK Spot uit de Google Play Store. Krijg de naadloze ervaring op je Android-apparaat. ",
    },
  " Download PK Spot from the Apple App Store. Get the seamless experience on your iPhone or iPad. ":
    {
      de: " Lade PK Spot aus dem Apple App Store herunter. Erhalte das nahtlose Erlebnis auf deinem iPhone oder iPad. ",
      es: " Descarga PK Spot desde la Apple App Store. Obtén la experiencia perfecta en tu iPhone o iPad. ",
      fr: " Téléchargez PK Spot sur l'App Store Apple. Profitez d'une expérience fluide sur votre iPhone ou iPad. ",
      it: " Scarica PK Spot dall'Apple App Store. Ottieni un'esperienza senza interruzioni sul tuo iPhone o iPad. ",
      nl: " Download PK Spot uit de Apple App Store. Krijg de naadloze ervaring op je iPhone of iPad. ",
    },
  '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Download for Android ':
    {
      de: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Für Android herunterladen ',
      es: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Descargar para Android ',
      fr: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Télécharger pour Android ',
      it: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Scarica per Android ',
      nl: '<ph id="0" equiv="TAG_IMG" type="image" disp="&lt;img src=&quot;assets/logos/android.svg&quot; alt=&quot;&quot; style=&quot;height: 20px&quot; class=&quot;me-2&quot; /&gt;" /> Download voor Android ',
    },
};

const normalize = (s) => s.replace(/\s+/g, " ").replace(/"\s+>/g, '">').trim();

function processFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const langMatch = filePath.match(/messages\.([a-zA-Z-]+)\.xlf/);
  const lang = langMatch ? langMatch[1] : null;

  if (!lang) {
    console.warn(`Could not determine language for ${filePath}`);
    return;
  }

  console.log(`Processing ${filePath} for language ${lang}...`);

  let content = fs.readFileSync(absolutePath, "utf8");

  // Regex to find units.
  // We capture:
  // 1. The part before <target>
  // 2. The source content
  // 3. The part between source end and target start (usually just whitespace + <target>)
  // 4. The target content
  // 5. The part after target content end

  // Note: This regex assumes standard order <source> then <target> inside a segment.

  // We'll iterate manually because we need to normalize the source for lookup but replace the target in the original string.

  // Strategy: match the full unit, parse source, lookup, replace target.

  const unitRegex =
    /<unit id="([^"]+)">[\s\S]*?<segment state="initial">[\s\S]*?<source>([\s\S]*?)<\/source>[\s\S]*?<target>([\s\S]*?)<\/target>[\s\S]*?<\/segment>[\s\S]*?<\/unit>/g;

  let match;
  let newContent = content;

  // We need to build a map of replacements to do.
  // We cannot modify newContent while iterating with regex on content, so we will collect replacements.
  const replacements = [];

  // Re-create regex to iterate
  // Re-create regex to iterate
  // Updated to handle attributes in source/target tags (e.g. <source xml:space="preserve">)
  // and handle tags split across lines (e.g. <source\n>)
  const unitRegexIter =
    /<unit id="([^"]+)">[\s\S]*?<segment state="initial">[\s\S]*?<source\b[^>]*>([\s\S]*?)<\/source>([\s\S]*?)<target\b[^>]*>([\s\S]*?)<\/target>[\s\S]*?<\/segment>[\s\S]*?<\/unit>/g;

  while ((match = unitRegexIter.exec(content)) !== null) {
    const fullMatch = match[0];
    const unitId = match[1];
    const sourceContent = match[2];
    const middleContent = match[3];
    const targetContent = match[4];

    const normalizedSource = normalize(sourceContent);
    const normalizedTarget = normalize(targetContent);

    // Explicit lookup first
    let translationKey = Object.keys(translations).find(
      (key) => normalize(key) === normalizedSource
    );

    if (translationKey) {
      let translation = translations[translationKey][lang];

      // Fallback for de-CH to de
      if (!translation && lang === "de-CH") {
        translation = translations[translationKey]["de"];
      }

      if (translation) {
        // Only replace if currently untranslated OR if we want to force update.
        // The user wants to fix missing ones.
        // If normalizedTarget is basically the same as normalizedSource (untranslated), replace it.
        // OR if the target is empty?

        // Let's rely on the fact that if it's in our list, we probably want to apply it.
        // But we should avoid overwriting if it's already translated to something else?
        // The previous logic was: if (unitSource === unitTarget).

        if (normalizedSource === normalizedTarget) {
          // It matches! We should replace targetContent with translation.
          // We need to preserve the surrounding XML structure of the unit, just replacing the inner text found in <target>.

          // However, simpler approach:
          // Construct the new target string.
          const newTargetContent = translation; // formatting might be lost if we don't handle it, but our keys include tags.

          // We will replace the specific substring of targetContent with newTargetContent
          // Actually, since we matched the whole group 4 as targetContent, we can replace that range in the file.

          // Start index of target content = match.index + ... this is hard to calculate exactly with variable groups.
          // Better: use string replace on the full match, but be careful.

          // Construct the replacement for the whole <target>...</target> block?
          // <target>targetContent</target>  -> <target>translation</target>

          // Let's allow for flexible whitespace in the replacement tag? No, standard is <target>...</target>

          // The safest way to replace specifically the target content found:
          // We know the exact string `targetContent` from the match.
          // BUT `targetContent` might appear multiple times? Unlikely inside this specific match.

          // Let's replace the whole match?
          // Reconstruct the unit:
          // Parts of the match we captured:
          // 1: id (not full match)
          // match[0] is the whole unit block.

          // We can use string replacement on match[0].
          // Replace `<target>${targetContent}</target>` with `<target>${translation}</target>`?
          // We need to be careful about characters that have regex meaning if we passed them into replace.

          // Better: We have the start and end indices of the match.
          // We can find the index of <target> inside the match.

          // Use regex to find the target tag start, because it might have attributes or newlines
          const targetTagRegex = /<target\b[^>]*>/;
          const targetTagMatch = fullMatch.match(targetTagRegex);

          if (targetTagMatch) {
            const targetTagStart = targetTagMatch.index;
            const targetTagLength = targetTagMatch[0].length;
            const contentStart = targetTagStart + targetTagLength;

            const contentEnd = fullMatch.indexOf("</target>", contentStart);

            if (contentEnd > contentStart) {
              const beforeTarget = fullMatch.substring(0, contentStart);
              const afterTarget = fullMatch.substring(contentEnd);

              const newUnitString = beforeTarget + translation + afterTarget;

              replacements.push({
                start: match.index,
                end: match.index + fullMatch.length,
                newText: newUnitString,
              });

              console.log(
                `Updated [${unitId}]: "${normalizedSource.substring(
                  0,
                  30
                )}..." -> "${translation.substring(0, 30)}..."`
              );
            }
          }
        }
      }
    }
  }

  // Apply replacements in reverse order to not mess up indices
  for (let i = replacements.length - 1; i >= 0; i--) {
    const rep = replacements[i];
    content =
      content.substring(0, rep.start) +
      rep.newText +
      content.substring(rep.end);
  }

  fs.writeFileSync(absolutePath, content);
}

files.forEach(processFile);
