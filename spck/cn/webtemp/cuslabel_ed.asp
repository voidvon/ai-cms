<% data_path="../../../" 'ACC连接数据库路径，对SQL无效 %>
<!--#include file="../../../conn/conn.asp"-->
<%
if request.Cookies("masterflag")="" or request.Cookies("masterflag")="" then
	response.write "<script language='javascript'>"
	response.write"parent.location.href='../../login.asp';</SCRIPT>" 
	response.end
end if
'权限限制^^^^^^^^^^^^^^^^^^^^
 dim ishavegant
 ishavegant=false
 in_str=split(request.Cookies("masterflag"),",")
 for each ins in in_str
 	if trim(ins)="010" then 
 		ishavegant=true
 	end if
 next 
 if ishavegant=false then
	 response.redirect "../../../err.asp"
 	response.end
 end if
 id=request.QueryString("id")
 Sql="Select * from benming_ch_cuslabel where id="&id
 Set Rs=server.CreateObject("ADODB.RecordSet") 
 Rs.open sql,Conn,1,3
 if request.QueryString("action")="save" then
 	rs("lname")="#"&request.Form("addclname")&"#"
	rs("ldes")=request.Form("addcldes")
	rs("lcontent")=request.Form("addclcontent")
	rs("lkind")=request.Form("editlkind")
	rs.update
	Rs.close
	Set Rs=nothing
	Conn.close
	Set Conn=nothing
	response.Redirect("cuslabel.asp")
end if
 if Rs.eof=False and Rs.bof=false then
 	addclname=Replace(rs("lname"),"#","")
	addcldes=rs("ldes")
	addclcontent=rs("lcontent")
	lkind=rs("lkind")
	rs.close
	Set RS=nothing
 end if
 
 %>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"
"http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=gb2312">
<LINK href="../../css/style.css" rel=stylesheet type=text/css>
<style type="text/css">
<!--
body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
}
.style1 {
	font-size: 16px;
	font-weight: bold;
	color: #FF0000;
}
.STYLE2 {color: #FF0000}
-->
</style></head>

<body>


<LINK href="../css/style.css" rel=stylesheet type=text/css>
 <title></title>
 <script language="javascript">
function checkcon(){
    var strn=document.myform.addclname.value;
    var strc=document.myform.addclcontent.value;
	if(strn==""){
		alert("请输入名称！");
   		document.myform.addclname.focus();
   		return false;
  	}	
	var sekind=document.myform.editlkind.value;
   	if(sekind==0){
   		alert("对不起！当前无任何类别，请添加类别!");
   		return false;
	}
	var addcldes=document.myform.addcldes.value;
	if(addcldes==""){
		alert("请输入描述！");
   		document.myform.addcldes.focus();
   		return false;
		
	}
    if(strc==""){
   		alert("请输入内容！");
   		document.myform.addclcontent.focus();
   		return false;
  	}
	
	}
	
	function checkl()
	{
		var str=document.myform.addclname.value;
  		if(str==""){
  			alert("请输入名称！");
  			document.myform.addclname.focus();
  			return false;
		}
    	window.open("cuscheck.asp?str="+str,"","width=500,height=200");
	}
	
	function chesear()
	{
		var str=document.seform.seark.value;
  		if(str.replace(/^\s+|\s+$/g,'')==""){
  			alert("请输入搜索的自定义标签名称！");
  			document.seform.seark.focus();
  			return false;
		}
  	}
</script>
<style type="text/css">
	a:link{
		color: #E30000;
}
	a:visited{
		color: #E80000;
}
	a:hover{}
	a:active{}
</style>
<table border="0" cellspacing="1" cellpadding="3" align=center class="tableBorder"> 
  <tr> 
    <th width="180%" class="tableHeaderText" height=25>网站HTML自定义标签管理</th> 
  </tr> 
  <tr> 
    <td class="forumRowHighlight"><p><B>注意</B>：<BR> 
        ①在这里，您可以修改模板，可以编辑风格，操作时请按照相关页面提示完整填写表单信息。<BR> 
        ②执行删除时要慎重，任何的删除操作都是不可逆的。<br> </td> 
  </tr> 
  <tr>
 	<td align="center" class="forumRowHighlight"><A href="addcuslabel.asp">添加自定义页面显示标签</A>| <a href="cuslabel.asp">自定义标签管理</a> | <a href="cuskind.asp">自定义标签类别管理</a> | [<a href="javascript:location.reload()">刷新页面</a>] </td> 
  </tr> 
</table>
<form name="myform" method="post" action="?id=<%=id%>&action=save" onSubmit="return checkcon();">
<table width="98%" border="0" align="center" cellpadding="0" cellspacing="0" class="tableBorder"  >
  <tr>
    <th height="22" colspan="2">添加自定义标签</th>
  </tr>
  <TR>
    <td ><div id="addlabel"   >
      
        <table width="98%" border="0" align="center" cellpadding="2" cellspacing="4" bgcolor="#F7F7F7" >
          <tr>
            <td  bgcolor="#F0F0F0" colspan="2"></td>
          </tr>
          <tr>
            <td align="right">标签名称：</td>
            <td>#
              <input type="text" name="addclname" value="<%=addclname%>" maxlength="25"  onblur="this.value=this.value.replace(/\s/igm,'')"/>
              #
              <input type="button"  name="checklabel"  value="检查标签是否有效" style="background-color:#DFDFDF" onClick="checkl();"/>
              &nbsp;&nbsp;   (格式<span class="STYLE2">:#BM_gdtop#</span>)<br />
            </td>
          </tr>
          <tr>
            <td align="right">所属类型：</td>
            <td><select size="1" name="editlkind">
			<option  >请选择分类</option>
			<%
				Sql="Select * from benming_ch_cuskind"
				Set Rs=Server.CreateObject("ADODB.RecordSet")
				Rs.open Sql,Conn,1,1
				do while not Rs.eof
					if lkind=Rs("id") then
						Response.Write("<option value='"&Rs("id")&"' selected>"&Rs("kindname")&"</option>")
					else
						Response.Write("<option value='"&Rs("id")&"'>"&Rs("kindname")&"</option>")
					end if
					Rs.movenext
				loop
				Rs.close
				Set Rs=nothing
				Conn.close
				Set Conn=nothing
			%>
              
            </select>
            </td>
          </tr>
          <tr>
            <td align="right">简单描述：</td>
            <td><input type="text" name="addcldes" value="<%=addcldes%>"  style="width:300px" maxlength="60" /></td>
          </tr>
          <tr>
            <td  align="right">标签内容：</td>
            <td><textarea rows="15" cols="87" name="addclcontent"><%=addclcontent%></textarea></td>
          </tr>
          <tr>
            <td align="center" colspan="2" height="40"><input type="submit"  name="addbtn"  value="我要修改" style="background-color:#DFDFDF"/>
            </td>
          </tr>
          <tr>
            <td colspan="6" align="center"  ></td>
          </tr>
        </table>
     
    </div></td>
  </TR>
</table> </form>
</body>
</html>


