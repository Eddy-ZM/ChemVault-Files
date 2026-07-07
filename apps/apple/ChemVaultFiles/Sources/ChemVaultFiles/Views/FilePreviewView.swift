import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif
#if canImport(PDFKit)
import PDFKit
#endif

struct FilePreviewView: View {
    let file: CVFileItem
    let data: Data?

    var body: some View {
        Group {
            if let data, file.typeLabel == "Image", let image = platformImage(data: data) {
                PlatformImageView(image: image)
                    .scaledToFit()
            } else if let data, file.typeLabel == "PDF" {
                PDFPreview(data: data)
            } else if let data, let text = String(data: data, encoding: .utf8), text.count < 200_000 {
                ScrollView {
                    Text(text)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "doc")
                        .font(.system(size: 48))
                        .foregroundStyle(.blue)
                    Text(file.typeLabel)
                    Text(ByteCountFormatter.string(fromByteCount: file.sizeBytes, countStyle: .file))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
    }
}

#if canImport(UIKit)
typealias NativeImage = UIImage
private func platformImage(data: Data) -> NativeImage? { UIImage(data: data) }
struct PlatformImageView: View {
    let image: NativeImage
    var body: some View { Image(uiImage: image).resizable() }
}
#elseif canImport(AppKit)
typealias NativeImage = NSImage
private func platformImage(data: Data) -> NativeImage? { NSImage(data: data) }
struct PlatformImageView: View {
    let image: NativeImage
    var body: some View { Image(nsImage: image).resizable() }
}
#endif

#if canImport(PDFKit)
struct PDFPreview: View {
    let data: Data
    var body: some View {
        PDFKitView(data: data)
    }
}

#if canImport(UIKit)
struct PDFKitView: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        return view
    }
    func updateUIView(_ view: PDFView, context: Context) {
        view.document = PDFDocument(data: data)
    }
}
#elseif canImport(AppKit)
struct PDFKitView: NSViewRepresentable {
    let data: Data
    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        return view
    }
    func updateNSView(_ view: PDFView, context: Context) {
        view.document = PDFDocument(data: data)
    }
}
#endif
#else
struct PDFPreview: View {
    let data: Data
    var body: some View { Text("PDF preview unavailable on this platform.") }
}
#endif
