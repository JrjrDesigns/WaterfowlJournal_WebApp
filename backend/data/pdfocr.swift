// Render PDF pages and OCR them with the macOS Vision framework.
// Emits TSV: page, x, y, w, h, confidence, text  (normalised coords, origin bottom-left)
// Bounding boxes are the point -- NR-1 is a table, so rows/columns must be
// reconstructed geometrically; a flat text dump loses the column alignment.
import Foundation
import PDFKit
import Vision
import CoreGraphics
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: pdfocr <file.pdf> [firstPage] [lastPage] [scale]\n".data(using:.utf8)!)
    exit(2)
}
let path = args[1]
let first = args.count > 2 ? Int(args[2]) ?? 1 : 1
let last  = args.count > 3 ? Int(args[3]) ?? first : first
let scale = args.count > 4 ? Double(args[4]) ?? 3.0 : 3.0

guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else {
    FileHandle.standardError.write("cannot open pdf\n".data(using:.utf8)!); exit(1)
}
print("page\tx\ty\tw\th\tconf\ttext")
for pno in first...min(last, doc.pageCount) {
    guard let page = doc.page(at: pno - 1) else { continue }
    let rect = page.bounds(for: .mediaBox)
    let w = Int(rect.width * scale), h = Int(rect.height * scale)
    guard w > 0, h > 0,
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { continue }
    ctx.setFillColor(CGColor(gray: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
    page.draw(with: .mediaBox, to: ctx)
    guard let img = ctx.makeImage() else { continue }

    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false     // numbers, not prose
    req.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: img, options: [:])
    do { try handler.perform([req]) } catch { continue }
    guard let obs = req.results else { continue }
    for o in obs {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        let txt = c.string.replacingOccurrences(of: "\t", with: " ")
        print("\(pno)\t\(String(format:"%.4f",b.minX))\t\(String(format:"%.4f",b.minY))\t\(String(format:"%.4f",b.width))\t\(String(format:"%.4f",b.height))\t\(String(format:"%.2f",c.confidence))\t\(txt)")
    }
}
