using System.Windows;
using System.Windows.Controls;

namespace Vanitas.Desktop.Views;

/// `panel.Add(child)` instead of `panel.Children.Add(child)`.
///
/// The dialogs in this folder are built in code, and the difference matters:
/// a screen's layout should read as its shape, not as navigation through a
/// collection property. Returning the child also lets a control be configured
/// inline at the point of insertion.
internal static class PanelX
{
    public static T Add<T>(this Panel panel, T child) where T : UIElement
    {
        panel.Children.Add(child);
        return child;
    }
}
