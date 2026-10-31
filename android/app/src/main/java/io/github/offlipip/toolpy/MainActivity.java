package io.github.offlipip.toolpy;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MlKitOcrPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
