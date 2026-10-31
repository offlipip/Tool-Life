package io.github.offlipip.toolpy;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MlKitOcrPlugin.class);
        super.onCreate(savedInstanceState);

        // Pede a permissão de câmera já na abertura do app, em vez de
        // deixar o seletor de foto do WebView pedir no meio do primeiro
        // toque no botão — nesse fluxo, se a permissão é concedida
        // DURANTE o seletor de arquivo (em vez de já estar concedida
        // antes), a câmera às vezes não abre nessa primeira tentativa.
        // Pedindo aqui, antes de qualquer botão, isso não acontece mais.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, 1001);
        }
    }
}
