using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

// The launcher measures Chrome's web-content HWND, rather than guessing the
// size of its title bar. All measurements and moves use physical screen pixels.
public static class SceneOverlayWindow
{
    public sealed class NativeWindowInfo
    {
        public long Handle;
        public string Title;
        public bool IsOverlay;
        public bool FitsWorkArea;
        public int Left;
        public int Top;
        public int Width;
        public int Height;
        public int ContentLeft;
        public int ContentTop;
        public int ContentWidth;
        public int ContentHeight;
    }

    public sealed class NativeWorkArea
    {
        public int Left;
        public int Top;
        public int Width;
        public int Height;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int Size;
        public RECT Monitor;
        public RECT Work;
        public uint Flags;
    }

    private delegate bool EnumWindowProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr parameter);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int capacity);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr window, out RECT rectangle);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT point, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

    private static IntPtr BeginDpiAware()
    {
        IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        if (previous == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot measure the overlay in physical screen pixels.");
        return previous;
    }

    private static string ClassName(IntPtr window)
    {
        StringBuilder name = new StringBuilder(128);
        GetClassName(window, name, name.Capacity);
        return name.ToString();
    }

    private static NativeWindowInfo InspectCore(IntPtr window)
    {
        if (ClassName(window) != "Chrome_WidgetWin_1")
            throw new InvalidOperationException("The overlay Chrome window is no longer available.");

        RECT outer;
        if (!GetWindowRect(window, out outer))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read the overlay window bounds.");

        NativeWindowInfo info = new NativeWindowInfo();
        info.Handle = window.ToInt64();
        StringBuilder title = new StringBuilder(512);
        GetWindowText(window, title, title.Capacity);
        info.Title = title.ToString();
        info.IsOverlay = info.Title.IndexOf("M\u00e0n h\u00ecnh ph\u00e1t", StringComparison.OrdinalIgnoreCase) >= 0;
        info.Left = outer.Left;
        info.Top = outer.Top;
        info.Width = outer.Right - outer.Left;
        info.Height = outer.Bottom - outer.Top;
        NativeWorkArea work = GetWorkAreaCore();
        info.FitsWorkArea = outer.Left >= work.Left && outer.Top >= work.Top &&
            outer.Right <= work.Left + work.Width && outer.Bottom <= work.Top + work.Height;

        long largestArea = 0;
        EnumChildWindows(window, delegate(IntPtr child, IntPtr ignored)
        {
            if (!IsWindowVisible(child) || ClassName(child) != "Chrome_RenderWidgetHostHWND")
                return true;
            RECT content;
            if (!GetWindowRect(child, out content)) return true;
            int width = content.Right - content.Left;
            int height = content.Bottom - content.Top;
            long area = (long)width * height;
            if (width > 0 && height > 0 && area > largestArea)
            {
                largestArea = area;
                info.ContentLeft = content.Left;
                info.ContentTop = content.Top;
                info.ContentWidth = width;
                info.ContentHeight = height;
            }
            return true;
        }, IntPtr.Zero);
        return info;
    }

    private static NativeWorkArea GetWorkAreaCore()
    {
        MONITORINFO monitor = new MONITORINFO();
        monitor.Size = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(MonitorFromPoint(new POINT(), 1), ref monitor))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read the primary monitor work area.");
        NativeWorkArea work = new NativeWorkArea();
        work.Left = monitor.Work.Left;
        work.Top = monitor.Work.Top;
        work.Width = monitor.Work.Right - monitor.Work.Left;
        work.Height = monitor.Work.Bottom - monitor.Work.Top;
        return work;
    }

    public static NativeWorkArea GetWorkArea()
    {
        IntPtr previous = BeginDpiAware();
        try { return GetWorkAreaCore(); }
        finally { SetThreadDpiAwarenessContext(previous); }
    }

    public static NativeWindowInfo[] GetWindows(int processId)
    {
        IntPtr previous = BeginDpiAware();
        try
        {
            List<NativeWindowInfo> windows = new List<NativeWindowInfo>();
            EnumWindows(delegate(IntPtr window, IntPtr ignored)
            {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                if (owner == (uint)processId && IsWindowVisible(window) && ClassName(window) == "Chrome_WidgetWin_1")
                {
                    NativeWindowInfo info = InspectCore(window);
                    if (info.ContentWidth > 0 && info.ContentHeight > 0) windows.Add(info);
                }
                return true;
            }, IntPtr.Zero);
            return windows.ToArray();
        }
        finally { SetThreadDpiAwarenessContext(previous); }
    }

    public static NativeWindowInfo Inspect(long handle)
    {
        IntPtr previous = BeginDpiAware();
        try { return InspectCore(new IntPtr(handle)); }
        finally { SetThreadDpiAwarenessContext(previous); }
    }

    public static void Activate(long handle)
    {
        IntPtr window = new IntPtr(handle);
        if (IsIconic(window)) ShowWindow(window, 9);
        SetForegroundWindow(window);
    }

    public static NativeWindowInfo Fit(long handle)
    {
        IntPtr previous = BeginDpiAware();
        try
        {
            IntPtr window = new IntPtr(handle);
            if (IsIconic(window) || IsZoomed(window)) ShowWindow(window, 9);

            NativeWindowInfo current = InspectCore(window);
            if (current.ContentWidth <= 0 || current.ContentHeight <= 0)
                throw new InvalidOperationException("Chrome's overlay content is not ready for sizing yet.");
            int frameWidth = current.Width - current.ContentWidth;
            int frameHeight = current.Height - current.ContentHeight;
            if (frameWidth < 0 || frameHeight < 0)
                throw new InvalidOperationException("Chrome's overlay content bounds are not ready yet.");

            NativeWorkArea work = GetWorkAreaCore();
            // Keep a visible margin on every side, including the title bar.
            int unit = Math.Min(120, Math.Min((work.Width - frameWidth - 48) / 9,
                                             (work.Height - frameHeight - 48) / 16));
            if (unit < 1) throw new InvalidOperationException("The screen is too small for the overlay window.");
            int width = unit * 9 + frameWidth;
            int height = unit * 16 + frameHeight;
            int left = work.Left + (work.Width - width) / 2;
            int top = work.Top + (work.Height - height) / 2;
            if (!SetWindowPos(window, IntPtr.Zero, left, top, width, height, 0x0014))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot fit the overlay window to the screen.");
            return InspectCore(window);
        }
        finally { SetThreadDpiAwarenessContext(previous); }
    }
}
