// SM-120 — Native desktop shell for Сметководител (Option B). A real WinForms .exe hosting a
// WebView2 control pointed at the local system — no Edge chrome, no browser branding, our own
// icon in the taskbar/alt-tab. Uses the Evergreen WebView2 runtime already on Windows 11.
using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace Smetko
{
    internal static class Program
    {
        private const string AppUrl = "http://localhost:3000/";

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

            var form = new Form
            {
                Text = "Сметководител",
                StartPosition = FormStartPosition.CenterScreen,
                Width = 1400,
                Height = 900,
                MinimumSize = new Size(1024, 680),
                BackColor = ColorTranslator.FromHtml("#f6f8fb"),
            };
            try { form.Icon = new Icon(Path.Combine(dir, "smetkovoditel.ico")); }
            catch { /* fall back to the exe's embedded icon */ }

            var web = new WebView2 { Dock = DockStyle.Fill };
            // Keep WebView2 state (cookies/session) in our own folder, isolated from the user's Edge.
            web.CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Smetkovoditel", "webview2"),
            };
            form.Controls.Add(web);
            web.Source = new Uri(AppUrl);

            Application.Run(form);
        }
    }
}
