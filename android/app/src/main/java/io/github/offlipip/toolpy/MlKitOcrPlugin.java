package io.github.offlipip.toolpy;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Leitura de texto on-device com o Google ML Kit — grátis, roda só no
 * aparelho (sem internet, sem servidor, sem custo por foto), e é o
 * motor de OCR usado quando o app roda dentro do apk nativo Android.
 *
 * No navegador (versão web no GitHub Pages) o ML Kit não existe, então
 * src/ocr.js detecta isso e continua usando o Tesseract.js como hoje —
 * este plugin é só um motor melhor, usado quando disponível, nunca uma
 * dependência obrigatória.
 */
@CapacitorPlugin(name = "MlKitOcr")
public class MlKitOcrPlugin extends Plugin {

    @PluginMethod
    public void recognizeText(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("missing base64 image");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("invalid base64: " + e.getMessage());
            return;
        }

        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bitmap == null) {
            call.reject("could not decode image");
            return;
        }

        InputImage image = InputImage.fromBitmap(bitmap, 0);
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

        recognizer.process(image)
            .addOnSuccessListener(visionText -> {
                JSObject result = new JSObject();
                result.put("fullText", visionText.getText());

                JSArray words = new JSArray();
                for (Text.TextBlock block : visionText.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        for (Text.Element element : line.getElements()) {
                            JSObject w = new JSObject();
                            w.put("text", element.getText());
                            Rect box = element.getBoundingBox();
                            if (box != null) {
                                w.put("x0", box.left);
                                w.put("y0", box.top);
                                w.put("x1", box.right);
                                w.put("y1", box.bottom);
                            } else {
                                w.put("x0", 0);
                                w.put("y0", 0);
                                w.put("x1", 0);
                                w.put("y1", 0);
                            }
                            words.put(w);
                        }
                    }
                }
                result.put("words", words);
                call.resolve(result);
            })
            .addOnFailureListener(e -> call.reject("ocr_failed: " + e.getMessage()));
    }
}
