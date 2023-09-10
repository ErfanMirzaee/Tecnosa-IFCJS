import {
  AmbientLight,
  AxesHelper,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Raycaster,
  MeshLambertMaterial,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import {
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCDOOR,
  IFCWINDOW,
  IFCFURNISHINGELEMENT,
  IFCMEMBER,
  IFCPLATE,
} from "web-ifc";
import { geometryTypes } from "./geometry-types";
import { IfcAPI } from "web-ifc/web-ifc-api";

//Creates the Three.js scene
const scene = new Scene();

//Object to store the size of the viewport
const size = {
  width: window.innerWidth,
  height: window.innerHeight,
};

//Creates the camera (point of view of the user)
const camera = new PerspectiveCamera(75, size.width / size.height);
camera.position.z = 15;
camera.position.y = 13;
camera.position.x = 8;

//Creates the lights of the scene
const lightColor = 0xffffff;

const ambientLight = new AmbientLight(lightColor, 0.5);
scene.add(ambientLight);

const directionalLight = new DirectionalLight(lightColor, 1);
directionalLight.position.set(0, 10, 0);
directionalLight.target.position.set(-5, 0, 0);
scene.add(directionalLight);
scene.add(directionalLight.target);

//Sets up the renderer, fetching the canvas of the HTML
const threeCanvas = document.getElementById("three-canvas");
const renderer = new WebGLRenderer({ canvas: threeCanvas, alpha: true });
renderer.setSize(size.width, size.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

//Creates grids and axes in the scene
const grid = new GridHelper(100, 60);
scene.add(grid);

const axes = new AxesHelper();
axes.material.depthTest = false;
axes.renderOrder = 1;
scene.add(axes);

//Creates the orbit controls (to navigate the scene)
const controls = new OrbitControls(camera, threeCanvas);
controls.enableDamping = true;
controls.target.set(-2, 0, 0);

//Animation loop
const animate = () => {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

animate();

//Adjust the viewport to the size of the browser
window.addEventListener("resize", () => {
  (size.width = window.innerWidth), (size.height = window.innerHeight);
  camera.aspect = size.width / size.height;
  camera.updateProjectionMatrix();
  renderer.setSize(size.width, size.height);
});

const alertBox = document.getElementById("alert_box");

const json = document.getElementById("json_error");

const input = document.getElementById("file-input");

const ifcModels = [];
const ifcLoader = new IFCLoader();
const ifcapi = new IfcAPI();

ifcLoader.ifcManager.setWasmPath("../");
ifcapi.SetWasmPath("../");

json.addEventListener(
  "input",
  (event) => {
    if (input.files[0]) {
      if (isJsonString(event.target.value)) {
        alertBox.innerHTML = "";
        const jsonData = JSON.parse(event.target.value);
        const guids = getGuidFromJson(jsonData);

        const reader = new FileReader();
        reader.onload = () => LoadFile(reader.result, guids);
        reader.readAsText(input.files[0]);
      } else {
        window
          .Toastify({
            text: "The text must be a valid JSON string.",
            duration: 3000,
            close: true,
            gravity: "bottom",
            position: "center",
            style: {
              background: "#dc2626",
              color: "#ffffff",
              padding: "10px 30px",
              borderRadius: "8px",
            },
          })
          .showToast();
      }
    } else {
      window
        .Toastify({
          text: "Please upload .ifc file then import json.",
          duration: 3000,
          close: true,
          gravity: "bottom",
          position: "center",
          style: {
            background: "#dc2626",
            color: "#ffffff",
            padding: "10px 30px",
            borderRadius: "8px",
          },
        })
        .showToast();
    }
  },
  false
);

input.addEventListener(
  "change",
  async (changed) => {
    const ifcURL = URL.createObjectURL(changed.target.files[0]);
    ifcLoader.load(ifcURL, async (ifcModel) => {
      ifcModels[0] = ifcModel;
      await setupAllCategories();
    });
  },
  false
);

// Sets up optimized picking
ifcLoader.ifcManager.setupThreeMeshBVH(
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast
);

// check json error
function getGuidFromJson(json) {
  const guids = [];
  json.forEach((item) => {
    for (const key in item) {
      if (key.toLowerCase().includes("status") && item[key] === "Fail") {
        for (const guidKey in item) {
          if (guidKey.includes("GUID")) {
            guids.push(item[guidKey]);
            addAlert(item[guidKey], key);
          }
        }
      }
    }
  });
  return guids;
}

function addAlert(guid, error) {
  alertBox.innerHTML +=
    "<div class='bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative' role='alert' > <strong class='font-bold'>" +
    guid +
    "}</strong> <span class='block sm:inline'>" +
    error +
    "</span> </div>";
}
function findExpressIdByGlobalId(jsonData, targetGlobalId) {
  for (const key in jsonData) {
    if (jsonData.hasOwnProperty(key)) {
      const entry = jsonData[key];
      if (entry.GlobalId && entry.GlobalId.value === targetGlobalId) {
        return entry.expressID;
      }
    }
  }
  return null;
}

function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

async function LoadFile(ifcAsText, guids) {
  const uint8array = new TextEncoder().encode(ifcAsText);
  const modelID = await OpenIfc(uint8array);
  const allItems = GetAllItems(modelID);

  const expressIds = [];
  guids.forEach((item) => {
    expressIds.push(findExpressIdByGlobalId(allItems, item));
  });
  highlight(modelID, expressIds);
}

async function OpenIfc(ifcAsText) {
  await ifcapi.Init();
  return ifcapi.OpenModel(ifcAsText);
}

function GetAllItems(modelID, excludeGeometry = true) {
  const allItems = {};
  const lines = ifcapi.GetAllLines(modelID);
  getAllItemsFromLines(modelID, lines, allItems, excludeGeometry);
  return allItems;
}

function getAllItemsFromLines(modelID, lines, allItems, excludeGeometry) {
  for (let i = 1; i <= lines.size(); i++) {
    try {
      saveProperties(modelID, lines, allItems, excludeGeometry, i);
    } catch (e) {
      console.log(e);
    }
  }
}

function saveProperties(modelID, lines, allItems, excludeGeometry, index) {
  const itemID = lines.get(index);
  const props = ifcapi.GetLine(modelID, itemID);
  props.type = props.__proto__.constructor.name;
  if (!excludeGeometry || !geometryTypes.has(props.type)) {
    allItems[itemID] = props;
  }
}

// categories checkbox

// List of categories names
const categories = {
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCFURNISHINGELEMENT,
  IFCDOOR,
  IFCWINDOW,
  IFCPLATE,
  IFCMEMBER,
};

// Gets the name of a category
function getName(category) {
  const names = Object.keys(categories);
  return names.find((name) => categories[name] === category);
}

// Gets all the items of a category
async function getAll(category) {
  return ifcLoader.ifcManager.getAllItemsOfType(0, category, false);
}

// Creates a new subset containing all elements of a category
async function newSubsetOfType(category) {
  const ids = await getAll(category);
  return ifcLoader.ifcManager.createSubset({
    modelID: 0,
    scene,
    ids,
    removePrevious: true,
    customID: category.toString(),
  });
}

// Stores the created subsets
const subsets = {};

async function setupAllCategories() {
  const allCategories = Object.values(categories);
  for (let i = 0; i < allCategories.length; i++) {
    const category = allCategories[i];
    await setupCategory(category);
  }
}

// Creates a new subset and configures the checkbox
async function setupCategory(category) {
  subsets[category] = await newSubsetOfType(category);
  setupCheckBox(category);
}

// Sets up the checkbox event to hide / show elements
function setupCheckBox(category) {
  const name = getName(category);
  const checkBox = document.getElementById(name);
  checkBox.addEventListener("change", (event) => {
    const checked = event.target.checked;
    const subset = subsets[category];
    if (checked) scene.add(subset);
    else subset.removeFromParent();
  });
}

// Highlight
const raycaster = new Raycaster();
raycaster.firstHitOnly = true;

const selectMat = new MeshLambertMaterial({
  transparent: true,
  opacity: 0.6,
  color: 0xdc2626,
  depthTest: false,
});

function highlight(id, expressIds) {
  ifcLoader.ifcManager.createSubset({
    modelID: id,
    ids: expressIds,
    material: selectMat,
    scene: scene,
    removePrevious: true,
  });
}
